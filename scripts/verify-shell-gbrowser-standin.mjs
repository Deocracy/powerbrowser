#!/usr/bin/env node
// scripts/verify-shell-gbrowser-standin.mjs
//
// G-14.1.1-19 gate (plan 14.1.1-04), rewritten by Phase 31.1 plan 02 Task 1 for
// the extension tab host: the shell window's `gBrowser` implements exactly the
// member set that upstream USES on it, and its `gBrowserInit` shim implements
// exactly the members upstream reads from it.
//
// Why a member gate at all. The shell window is deliberately not Firefox chrome
// and has no tabbrowser, but privileged upstream code still reaches
// `win.gBrowser`. A member that is missing throws a TypeError at the call (or,
// for an optional chain on the RECEIVER, once per overlay). This gate is a
// POSITIVE set-equality assertion, because CLAUDE.md's first verification rule
// forbids asserting on the ABSENCE of a log line whose emitter the check does
// not control. The invariant is restated as something the tree proves: the
// implemented member set EQUALS the set upstream uses.
//
// Both sides are DERIVED at check time (CLAUDE.md `## Verification` rule 2):
//
//   REQUIRED (gBrowser)
//     actor scope     -- UPSTREAM_SCOPE: the widget file, every
//                        *Parent.sys.mjs under upstream/browser/actors and
//                        upstream/toolkit/actors, and every parent module the two
//                        actor registries name (Phase 35 plan 01, T-27-11): each
//                        `parent:` esModuleURI/moduleURI in DesktopActorRegistry.sys.mjs
//                        and ActorManagerParent.sys.mjs, resolved to an upstream
//                        file (moz-src:///X -> upstream/X; any other URI by its
//                        unique non-test basename). Calls only, as before.
//     extension scope -- every non-test *.js/*.mjs under
//                        upstream/browser/components/extensions/ and
//                        upstream/toolkit/components/extensions/, listed by
//                        read-only `git -C upstream ls-tree -r --name-only HEAD`.
//                        Every member access counts: call, read, assignment or
//                        destructuring. Tracker code reads members as data.
//     receivers       -- in both scopes: `gBrowser`, any `.getTabBrowser()`
//                        result chained directly, and any identifier bound in the
//                        same file from an expression ending in `.gBrowser` or
//                        `.getTabBrowser()`. The host makes getTabBrowser() non-null
//                        for overlays (toolkit/content/widgets/browser-custom-element.mjs:950-955).
//   REQUIRED (gBrowserInit)
//     both scopes     -- every member accessed on `gBrowserInit`.
//   IMPLEMENTED (gBrowser)
//     the top-level members of the `window.gBrowser = {` literal in
//     powerbrowser/shell/powerbrowser.js, parsed by brace matching with comment
//     lines skipped, so a name that appears only in a comment cannot satisfy the set.
//   IMPLEMENTED (gBrowserInit)
//     the members of the `gBrowserInit = {` literal in
//     powerbrowser/shell/PowerBrowserAPI.sys.mjs. That file must hold exactly one
//     such definition; zero or two is a broken instrument.
//
// The comparison for gBrowser is: REQUIRED == IMPLEMENTED methods ∪
// DELIBERATELY_ABSENT. DELIBERATELY_ABSENT names the members upstream uses that
// the shell must NOT implement, each with its verified reason. Failure kinds,
// each named: UNIMPLEMENTED (required, neither implemented nor absent), STALE
// ABSENCE (absent, no longer used), CONTRADICTION (implemented and absent), DEAD
// SURFACE (implemented, nobody uses it), UNCOVERED CALL SITE (an absence reason
// that does not name a file the member is used in), MISSING DATA MEMBER, STALE DATA MEMBER,
// and for gBrowserInit the same four shapes named `gBrowserInit.<member>`.
//
// DATA_MEMBERS are data properties, held out of the comparison and asserted on
// their own. `tabs` and `webDriverTabs` are read by WebDriver and extensions
// through a receiver the derivation cannot name (remote/shared/TabManager.sys.mjs
// reads `webDriverTabs` through a local `tabBrowser` binding, and 050 adds that
// read). `webDriverTabs` is therefore also asserted against the 050 patch text.
//
// An empty derivation on any side fails distinctly as a broken instrument. A
// negated or set-equality assertion over a walk that found nothing is not a
// clean tree.
//
// This file is exempt from its own scan by basename: it must spell the shapes it
// matches.
//
// Honestly --quick: it reads text files only. No build, no browser, no display,
// no network. `git ls-tree` reads the local object store only.
//
// Self-test (--self-test): asserts the unmodified tree green, then plants faults,
// each asserted to have LANDED and each required to go red NAMING the drift:
//   (a) a staged stand-in with one implemented member removed;
//   (b) a staged copy of one actor-scope file with a new member call added;
//   (c) a staged stand-in carrying a surplus member nothing upstream uses;
//   (d) an empty actor-scope file list (broken instrument);
//   (e) a NEW caller file written into a copy of a scanned actor directory;
//   (f) a stale entry added to a copy of DELIBERATELY_ABSENT;
//   (g) an implemented member also listed absent;
//   (p) a staged extension-scope copy that only READS gBrowser.zzzPlantedRead;
//   (q) a staged actor parent that calls a member through a bound getTabBrowser() receiver;
//   (r) a staged gBrowserInit literal without isAdoptingTab;
//   (s) staged patch text without the TabManager hunk (STALE DATA MEMBER webDriverTabs);
//   (h) a staged registry entry whose parent module sits outside the scanned
//       directories and calls a new gBrowser member (registry derivation);
//   (i) a staged registry entry whose basename resolves to no file (broken instrument);
//   (o) an absence reason naming only one of the member's call-site files.

import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = 'verify-shell-gbrowser-standin';
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const SELF_BASENAME = 'verify-shell-gbrowser-standin.mjs';

// READ ONLY. The SCOPE is reviewable here; the file lists are derived from it.
// Never written by this gate: the upstream checkout must not change.
const UPSTREAM_SCOPE = {
  files: [
    [
      'upstream/toolkit/content/widgets/browser-custom-element.mjs',
      'the <browser> element resolves its owning tabbrowser through an optional chain on the gBrowser RECEIVER (getTabBrowser), so a missing member throws instead of short-circuiting -- once per overlay creation',
    ],
  ],
  dirs: [
    [
      'upstream/browser/actors',
      'browser-level JSWindowActor parents run in the parent process for every <browser>, the shell overlays included, and reach win.gBrowser of the window that embeds it',
    ],
    [
      'upstream/toolkit/actors',
      'toolkit-level JSWindowActor parents run for the same browsers; scanned so a rebase that adds a gBrowser call there is caught at check time',
    ],
  ],
  // The directory scan stays: an actor registered from code outside these two registries is still covered.
  registries: [
    [
      'upstream/browser/components/DesktopActorRegistry.sys.mjs',
      'names every browser-level JSWindowActor and JSProcessActor parent module Gecko loads, wherever in the tree it lives (ProfilesParent, ScreenshotsUtils, PdfjsParent are outside the two directories)',
    ],
    [
      'upstream/toolkit/modules/ActorManagerParent.sys.mjs',
      'names every toolkit-level JSWindowActor and JSProcessActor parent module (LoginManagerParent, TranslationsParent, PictureInPicture are outside the two directories)',
    ],
  ],
};
const PARENT_SUFFIX = 'Parent.sys.mjs';

// The extension scope: every non-test source file under these upstream prefixes.
const EXTENSION_PREFIXES = ['browser/components/extensions/', 'toolkit/components/extensions/'];

const SHELL_FILE = 'powerbrowser/shell/powerbrowser.js';
const BOUNDARY_FILE = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';
const PATCH_FILE = 'patches/050-extension-tab-host.patch';
const STANDIN_ANCHOR = 'window.gBrowser';
const SHIM_ANCHOR = 'gBrowserInit = {';
// Phase 32 plan 09 (PAGE-02): the zoom shims under the Phase 27 policy, each compared the way gBrowserInit is. Each is
// defined once in the boundary file as `win.<Name> = {`. A member upstream reads that the shim must not implement is
// listed in ZOOM_SHIM_ABSENT with its reason; a listed member the shim implements is a CONTRADICTION.
const ZOOM_SHIMS = ['ZoomManager', 'FullZoom', 'ZoomUI'];
const ZOOM_SHIM_ABSENT = new Map([
  ['FullZoom.reset', "KNOWN GAP: reached only by tabs.setZoom (ext-tabs.js:1266-1283), an extension zoom write; the shell's zoom is chrome-driven through the 32-01 webTabZoom arms, and the call keeps failing with a TypeError as it does today"],
  ['FullZoom.setZoom', "KNOWN GAP: reached only by tabs.setZoom (ext-tabs.js:1266-1283), an extension zoom write; see FullZoom.reset"],
]);
const ID = '[A-Za-z_$][\\w$]*';

// The pinned tree's non-test file list as `upstream/<path>`, read once per run
// (read-only). null when git cannot list it.
let upstreamListing;
function upstreamFileList() {
  if (upstreamListing !== undefined) return upstreamListing;
  try {
    upstreamListing = execFileSync('git', ['-C', join(REPO_ROOT, 'upstream'), 'ls-tree', '-r', '--name-only', 'HEAD'], {
      encoding: 'utf8',
      maxBuffer: 1 << 28,
    })
      .split('\n')
      .filter(p => p && !p.split('/').some(seg => seg === 'test' || seg === 'tests'))
      .map(p => `upstream/${p}`);
  } catch {
    upstreamListing = null;
  }
  return upstreamListing;
}

// Every `parent:` object's esModuleURI or moduleURI in one registry, comment lines
// stripped. null when the registry is unreadable.
const REGISTRY_PARENT_RE = /\bparent\s*:\s*\{[^}]*?\b(?:esModuleURI|moduleURI)\s*:\s*["'`]([^"'`]+)["'`]/g;
function registryParentURIs(path) {
  const src = readSource(path);
  if (src === null) return null;
  return [...stripCommentLines(src).matchAll(REGISTRY_PARENT_RE)].map(m => m[1]);
}

// A module URI to one file of `fileList`: moz-src:///X is upstream/X; any other
// URI matches by basename, exactly once. Returns { path } or { error }.
function resolveModuleURI(uri, fileList) {
  if (uri.startsWith('moz-src:///')) {
    const path = `upstream/${uri.slice('moz-src:///'.length)}`;
    return fileList.includes(path) ? { path } : { error: `${uri} (no file ${path})` };
  }
  const base = uri.split('/').pop();
  const matches = fileList.filter(p => p.split('/').pop() === base);
  if (matches.length !== 1) return { error: `${uri} (${matches.length} files named ${base})` };
  return { path: matches[0] };
}

// The upstream call-site files for the actor scope: the scope's widget files,
// every *Parent.sys.mjs directly under each scope directory, and every parent
// module the scope's registries name, de-duplicated and sorted. An unreadable
// directory or registry, a registry yielding no URI, and an unresolvable URI are
// each reported, never an empty clean list. `fileList` is the resolver's file list.
function deriveCallSiteFiles(scope = UPSTREAM_SCOPE, fileList = upstreamFileList()) {
  const files = scope.files.map(([p]) => p);
  const unreadable = [];
  const broken = [];
  const uriCounts = { entries: 0, distinct: new Set() };
  for (const [registry] of scope.registries ?? []) {
    const uris = registryParentURIs(registry);
    if (uris === null) {
      unreadable.push(registry);
      continue;
    }
    if (uris.length === 0) {
      broken.push(`${registry} yielded zero parent module URIs`);
      continue;
    }
    if (fileList === null) {
      broken.push('git -C upstream ls-tree -r HEAD (no file list to resolve registry URIs against)');
      break;
    }
    uriCounts.entries += uris.length;
    for (const uri of uris) {
      uriCounts.distinct.add(uri);
      const r = resolveModuleURI(uri, fileList);
      if (r.error) broken.push(`unresolvable parent module URI in ${registry.split('/').pop()}: ${r.error}`);
      else files.push(r.path);
    }
  }
  for (const [dir] of scope.dirs) {
    const abs = dir.startsWith('/') ? dir : join(REPO_ROOT, dir);
    let names;
    try {
      names = readdirSync(abs, { withFileTypes: true });
    } catch {
      unreadable.push(dir);
      continue;
    }
    for (const d of names) {
      if (d.isFile() && d.name.endsWith(PARENT_SUFFIX)) files.push(`${dir}/${d.name}`);
    }
  }
  return { files: [...new Set(files)].sort(), unreadable, broken, uriEntries: uriCounts.entries, uriDistinct: uriCounts.distinct.size };
}

// The extension scope, from the pinned tree's file list (read-only).
function deriveExtensionFiles() {
  const listing = upstreamFileList();
  if (listing === null) return { files: [], unreadable: ['git -C upstream ls-tree -r HEAD'] };
  const files = listing
    .filter(p => EXTENSION_PREFIXES.some(prefix => p.startsWith(`upstream/${prefix}`)))
    .filter(p => /\.m?js$/.test(p));
  return { files: files.sort(), unreadable: [] };
}

// Data properties: held out of the call comparison and asserted present.
// `webDriverTabs` also asserts that the 050 patch adds a line reading it.
const DATA_MEMBERS = new Map([
  [
    'tabs',
    { reason: 'extensions read gBrowser.tabs as data (tabs.query, the tab events) and WebDriver reads it through remote/shared/TabManager.sys.mjs; no gBrowser-receiver call site can name it', patchLine: null },
  ],
  [
    'webDriverTabs',
    {
      reason: 'WebDriver reaches the Theia frame and every overlay through gBrowser.webDriverTabs, read by the 050 TabManager hunk (remote/shared/TabManager.sys.mjs); the hunk must stay in the patch',
      patchLine: /^\+.*\btabBrowser\.webDriverTabs\b/m,
    },
  ],
]);

// Members upstream uses that the shell deliberately does NOT implement. Each reason
// was checked against the pinned tag. Implementing one would mean handing a
// privileged actor or an extension a tab, tabbrowser behaviour or window furniture
// the shell does not have.
const DELIBERATELY_ABSENT = new Map([
  [
    'getTabDialogBox',
    'PromptParent feature-detects it (`win?.gBrowser?.getTabDialogBox &&`) before calling it; absent keeps the window-modal prompt path, which needs no tab. ScreenshotsUtils (:803, openPreviewDialog from takeScreenshot :1185) calls it unguarded, but only inside a screenshot session that ScreenshotsUtils.start opens; the shell has no screenshot entry point (the browser-sets.js key, the toolbar button and the context-take-screenshot row are browser.xhtml furniture, and 35 D-12 omits that row)',
  ],
  [
    'setTabLabelForAuthPrompts',
    'PromptParent calls it only inside the getTabDialogBox branch, which an absent getTabDialogBox never enters',
  ],
  [
    'getNotificationBox',
    'BlockedSiteParent (:39, :78), DecoderDoctorParent (:102), EncryptedMediaParent (:152, :188), PluginParent (:131) and SpeechDispatcherParent (:61) call it on a getTabBrowser() receiver, which the Phase 31.1 host makes non-null for overlays. The shell has no notification box (Phase 37 furniture), so each call throws a TypeError on the missing member, the outcome the old null receiver gave. AboutLoginsParent (:713, :746) calls it on gBrowser directly, but serves only about:logins, which an overlay never loads: the webTabOpen and webTabNavigate scheme walls refuse it and web content cannot link to it (AboutRedirector.cpp:71-75 has no MAKE_LINKABLE)',
  ],
  [
    'addTrustedTab',
    'ProfilesParent (:95, :258) calls it on topChromeWindow.gBrowser while handling Profiles:CancelDelete. The Profiles actor matches only about:editprofile, about:deleteprofile and about:newprofile in the privilegedabout process (DesktopActorRegistry.sys.mjs:703-715); overlays load only http(s) or the empty page through the webTabOpen and webTabNavigate scheme walls, and web content cannot link to those pages because their about modules lack MAKE_LINKABLE (AboutRedirector.cpp:152-169, nsAboutProtocolHandler.cpp:66-72). Its removeTab (:97, :260) is the stand-in refusal',
  ],
  [
    'getPanel',
    'ScreenshotsUtils.openPanel (:881-882) calls it when ScreenshotsComponentParent receives Screenshots:ShowPanel (:145-147), which ScreenshotsComponentChild sends only for a trusted event (:88, :155-156) that the screenshots overlay dispatches after ScreenshotsUtils.start. The shell has no screenshot entry point (the browser-sets.js:275 key, the toolbar button and the context-take-screenshot row are browser.xhtml furniture, and 35 D-12 omits that row)',
  ],
  [
    'getFindBar',
    "PdfjsParent's find-bar hookups (_updateControlState :601, _updateMatchesCount :670) call it on browser.getTabBrowser(). Before the 31.1 host that receiver was null and the next line threw a TypeError; now getTabForBrowser answers and this call throws the same TypeError, so the outcome is unchanged. The shell has no find bar: Phase 32 find drives overlay.finder and never loads findbar.js (32 D-07)",
  ],
  [
    'getCachedFindBar',
    "PdfjsParent (_hookupEventListeners :772) and TranslationsParent's #registerFindBarEventListeners (:1575, :3763; called from actor creation :610 and on TabFindInitialized) call it on browser.getTabBrowser(). The old null receiver threw a TypeError on the line before; now getTabForBrowser answers and this call throws the same TypeError, so the outcome is unchanged. The shell has no find bar (32 D-07: Phase 32 find drives overlay.finder)",
  ],
  [
    'swapBrowsers',
    'browser-custom-element.mjs:1617 is reached only when both browsers have a tabbrowser (:1611-1612), an XPCOM swapDocShells path. The host gives every overlay a tabbrowser, so the call now reaches the missing member and throws a TypeError, where the old null receiver skipped it. powerbrowser/shell calls neither swapDocShells nor swapBrowsers. Open item: no roadmap phase names this path; Phase 36 (browser adoption) is the nearest owner',
  ],
  [
    'updateBrowserSharing',
    'WebRTCParent.sys.mjs:155 reads its receiver from browser.documentGlobal.gBrowser (:153) and reports camera, microphone and screen sharing, which is Phase 37 furniture. The old stand-in also lacked the member, so the TypeError is pre-existing; the receiver widening revealed it',
  ],
  [
    'refreshBlocked',
    'KNOWN GAP: RefreshBlockerParent calls it on the stand-in itself, but the actor is registered only while accessibility.blockautorefresh is on; with that pref on the call throws a TypeError, and the notification bar it would show belongs to Phase 37',
  ],
  // Extension-scope members the shell does not implement yet. Each is reached only
  // from an extension API WRITE (or an install or identity path), never from an
  // EXT-05 read path (tabs.query, tabs.get, tabs.on*, windows.get*, sender.tab, the
  // webRequest and webNavigation tab ids). Each group names its verified call sites.
  ...absentGroup(
    ['moveTabTo', 'moveTabsBefore', 'moveTabsAfter', 'pinTab', 'unpinTab', 'addToMultiSelectedTabs', 'removeFromMultiSelectedTabs', 'lockClearMultiSelectionOnce'],
    'tabs.update pin and highlight writes (ext-tabs.js:926-947) and tab moves (ext-tabs.js:1811, :1847; ext-tabGroups.js:245) reach it. Tab order, pinning and multi-selection are Phase 34 furniture, so the call throws a TypeError on the missing member'
  ),
  [
    '_insertBrowser',
    'ext-tabs.js:913 is in the else branch of `if (nativeTab.linkedPanel)` (ext-tabs.js:903-905). Every host node carries a linkedPanel (makeTabNode, PowerBrowserAPI.sys.mjs), so the branch is unreachable. Phase 34 owns the tab-strip move path that would reach it',
  ],
  ...absentGroup(
    ['adoptTab', 'adoptTabGroup', 'adoptSplitView'],
    'a tab or group moved into another window is adopted through these (ext-tabs.js:1193, :1207; ext-tabGroups.js:243). Window adoption is Phase 36, so the call throws a TypeError on the missing member'
  ),
  ...absentGroup(
    ['discardBrowser', 'prepareDiscardBrowser', 'duplicateTab', 'warmupTab', 'removeTabs', 'setSuccessor', 'replaceInSuccession', 'addTabGroup', 'getTabGroupById', 'isSplitViewWrapper'],
    'tabs.discard, tabs.duplicate, tabs.warmup, tabs.remove and tabs.group writes reach it (ext-tabs.js:851, :862, :866, :970, :992, :1246, :1637, :1780, :1788, :1839). They are Phase 38 extension API writes, so the call throws a TypeError on the missing member'
  ),
  [
    'hideTab',
    'tabs.hide reaches it (ext-tabs.js:1672). Phase 38 owns the hide write; until then no host node is ever hidden',
  ],
  [
    'showTab',
    'the unload loop at ext-tabs.js:58-66 calls it only for a tab whose `hidden` is set. No host node is hidden (hideTab is absent, ext-tabs.js:1672), so it is unreachable until Phase 38 adds hide',
  ],
  [
    'updateTitlebar',
    'windows.update with a titlePreface calls it on the shell window (ext-windows.js:540). Title furniture and windows.update writes are Phase 38; the call throws a TypeError on the missing member',
  ],
  [
    'loadURI',
    'replaceUrlInTab (ext-browser.js:140) runs for the chrome_url_overrides and chrome_settings_overrides install paths (ext-url-overrides.js:52, ext-chrome-settings-overrides.js:56), which hand it a window gBrowser. The shell has no tab to replace, so the call throws a TypeError. Owned by Phase 38 (the EXT-09 install flow)',
  ],
  [
    'webNavigation',
    'the browser.identity web-auth cancel path reads it (ext-identity.js:85). Identity is a Phase 38 extension-sign-in surface and is not on an EXT-05 read path',
  ],
]);

// One reason shared by a group of members: [name, reason] pairs for the Map.
function absentGroup(names, reason) {
  return names.map(name => [name, reason]);
}

// A member CALL or READ on a receiver pattern, optional chaining included.
// Returns the member names; `callsOnly` keeps only the names followed by `(`.
function accessesOn(code, receiver, callsOnly) {
  const names = new Set();
  const re = new RegExp(`${receiver}\\s*\\??\\.\\s*(${ID})(\\s*\\()?`, 'g');
  let m;
  while ((m = re.exec(code)) !== null) {
    if (!callsOnly || m[2]) names.add(m[1]);
  }
  return names;
}

// `let x = <expr>.gBrowser` or `= <expr>.getTabBrowser()`, the expression ending the
// statement. The binding name is then a receiver in the same file.
const BIND_RE = /\b(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*?(?:\.gBrowser|\.getTabBrowser\(\))(?=\s*(?:[;),]|$))/gm;
// `let { a, b: c } = <expr>.gBrowser`: destructuring reads members as data.
const DESTR_RE = /\b(?:let|const|var)\s*\{([^}\n]*)\}\s*=\s*[^;\n]*?(?:\.gBrowser|\.getTabBrowser\(\))(?=\s*(?:[;),]|$))/gm;

function isCommentLine(line) {
  const trimmed = line.replace(/^\s+/, '');
  return trimmed.startsWith('//') || trimmed.startsWith('*');
}

function stripCommentLines(src) {
  return src
    .split('\n')
    .map(line => (isCommentLine(line) ? '' : line))
    .join('\n');
}

function readSource(path) {
  const abs = path.startsWith('/') ? path : join(REPO_ROOT, path);
  try {
    return readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
}

// gBrowser members used by one comment-stripped source. `callsOnly` is the actor
// scope rule; the extension scope passes false and counts every access.
function gBrowserMembersOf(code, callsOnly) {
  const members = new Set();
  for (const n of accessesOn(code, '\\bgBrowser', callsOnly)) members.add(n);
  for (const n of accessesOn(code, '\\.getTabBrowser\\(\\)', callsOnly)) members.add(n);
  const bound = new Set();
  for (const m of code.matchAll(BIND_RE)) bound.add(m[1]);
  for (const id of bound) {
    const escaped = id.replace(/\$/g, '\\$');
    for (const n of accessesOn(code, `(?<![\\w$.])${escaped}`, callsOnly)) members.add(n);
  }
  if (!callsOnly) {
    for (const m of code.matchAll(DESTR_RE)) {
      for (const part of m[1].split(',')) {
        const name = part.split(':')[0].trim();
        if (new RegExp(`^${ID}$`).test(name)) members.add(name);
      }
    }
  }
  return members;
}

// Derives the gBrowser REQUIRED set over a list of files. `callsOnly` applies to
// the whole list (actor scope true, extension scope false).
function deriveRequired(files, callsOnly) {
  const members = new Set();
  const sites = new Map(); // member -> Set of call-site file paths
  const unreadable = [];
  for (const path of files) {
    if (path.split('/').pop() === SELF_BASENAME) continue;
    const src = readSource(path);
    if (src === null) {
      unreadable.push(path);
      continue;
    }
    for (const n of gBrowserMembersOf(stripCommentLines(src), callsOnly)) {
      members.add(n);
      if (!sites.has(n)) sites.set(n, new Set());
      sites.get(n).add(path);
    }
  }
  return { members, sites, unreadable };
}

// A call-site file as an absence reason names it: the basename without its extension.
// shortcut: coverage is checked per file, not per line, because line numbers drift on every rebase; a new call
// inside an already-named file is not caught here.
function fileStem(path) {
  return path.split('/').pop().replace(/(\.sys)?\.m?js$/, '');
}

// Every member accessed on `gBrowserInit` over a list of files (reads and calls).
function deriveShimRequired(files) {
  const members = new Set();
  for (const path of files) {
    const src = readSource(path);
    if (src === null || path.split('/').pop() === SELF_BASENAME) continue;
    for (const n of accessesOn(stripCommentLines(src), '(?<![\\w$])gBrowserInit', false)) members.add(n);
  }
  return members;
}

// Top-level member names of the object literal that follows `anchor`, by brace
// matching over comment-stripped source with string literals skipped. Returns
// null when the anchor or its literal cannot be found at all: a distinct
// broken-instrument outcome, never an empty clean set.
function objectLiteralMembers(code, anchor) {
  const at = code.indexOf(anchor);
  if (at === -1) return null;
  const open = code.indexOf('{', at);
  if (open === -1) return null;

  const members = new Set();
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    const c = code[i];
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i++;
      while (i < code.length && code[i] !== quote) {
        if (code[i] === '\\') i++;
        i++;
      }
      continue;
    }
    if (c === '{' || c === '[' || c === '(') {
      depth++;
      continue;
    }
    if (c === '}' || c === ']' || c === ')') {
      depth--;
      if (depth === 0) return members;
      continue;
    }
    if (depth === 1 && /[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < code.length && /[\w$]/.test(code[j])) j++;
      const word = code.slice(i, j);
      let k = j;
      while (k < code.length && /\s/.test(code[k])) k++;
      // A key is an identifier followed by `:` (property) or `(` (method
      // shorthand, getter, setter). Anything else at depth 1 is not a member name.
      if (code[k] === ':' || code[k] === '(') members.add(word);
      i = j - 1;
    }
  }
  return null; // unbalanced literal -- broken instrument, not a clean set
}

function deriveImplemented(shellFile) {
  const src = readSource(shellFile);
  if (src === null) return { members: null, reason: 'unreadable' };
  const members = objectLiteralMembers(stripCommentLines(src), STANDIN_ANCHOR);
  if (members === null) return { members: null, reason: 'no-literal' };
  return { members, reason: '' };
}

// The gBrowserInit literal: exactly one definition in the boundary file.
function deriveShimImplemented(boundaryFile) {
  const src = readSource(boundaryFile);
  if (src === null) return { members: null, reason: 'unreadable', count: 0 };
  const code = stripCommentLines(src);
  const count = (code.match(/\bgBrowserInit\s*=\s*\{/g) || []).length;
  if (count !== 1) return { members: null, reason: 'definitions', count };
  const members = objectLiteralMembers(code, SHIM_ANCHOR);
  if (members === null) return { members: null, reason: 'no-literal', count };
  return { members, reason: '', count };
}

// Phase 32 plan 09: every member accessed on the bare receiver `name` over the actor and extension scopes, every access counted.
function deriveZoomShimRequired(name, files) {
  const members = new Set();
  for (const path of files) {
    const src = readSource(path);
    if (src === null || path.split('/').pop() === SELF_BASENAME) continue;
    for (const n of accessesOn(stripCommentLines(src), `(?<![\\w$])${name}`, false)) members.add(n);
  }
  return members;
}

// The `win.<name> = {` literal in the boundary file: exactly one definition, or a broken instrument.
function deriveZoomShimImplemented(boundaryFile, name) {
  const src = readSource(boundaryFile);
  if (src === null) return { members: null, reason: 'unreadable', count: 0 };
  const code = stripCommentLines(src);
  const count = (code.match(new RegExp(`\\bwin\\.${name}\\s*=\\s*\\{`, 'g')) || []).length;
  if (count !== 1) return { members: null, reason: 'definitions', count };
  const members = objectLiteralMembers(code, `win.${name} = {`);
  if (members === null) return { members: null, reason: 'no-literal', count };
  return { members, reason: '', count };
}

function sorted(set) {
  return [...set].sort();
}

// `inputs` = { actorFiles, extensionFiles, shellFile, boundaryFile, patchFile, absent }.
function runScan(inputs) {
  const { actorFiles, extensionFiles, shellFile, boundaryFile, patchFile } = inputs;
  const absent = inputs.absent ?? DELIBERATELY_ABSENT;
  if (actorFiles.length === 0) {
    return { ok: false, reason: 'empty-upstream', detail: 'no actor-scope call-site files were supplied' };
  }
  if (extensionFiles.length === 0) {
    return { ok: false, reason: 'empty-extension', detail: 'no extension-scope files were derived' };
  }
  const actor = deriveRequired(actorFiles, true);
  if (actor.unreadable.length) {
    return { ok: false, reason: 'unreadable-upstream', detail: actor.unreadable.join(', ') };
  }
  const ext = deriveRequired(extensionFiles, false);
  if (ext.unreadable.length) {
    return { ok: false, reason: 'unreadable-upstream', detail: ext.unreadable.join(', ') };
  }
  const required = new Set([...actor.members, ...ext.members]);
  if (required.size === 0) {
    return { ok: false, reason: 'empty-required', detail: 'derived zero gBrowser member uses from the upstream call sites' };
  }

  const impl = deriveImplemented(shellFile);
  if (impl.members === null) {
    return { ok: false, reason: `implemented-${impl.reason}`, detail: shellFile };
  }
  if (impl.members.size === 0) {
    return { ok: false, reason: 'empty-implemented', detail: shellFile };
  }

  const dataNames = [...DATA_MEMBERS.keys()];
  const missingData = dataNames.filter(k => !impl.members.has(k));
  const staleData = [];
  for (const [name, spec] of DATA_MEMBERS) {
    if (!spec.patchLine) continue;
    const patch = readSource(patchFile);
    if (patch === null) return { ok: false, reason: 'unreadable-patch', detail: patchFile };
    if (!spec.patchLine.test(patch)) staleData.push(name);
  }
  const methods = new Set([...impl.members].filter(m => !DATA_MEMBERS.has(m)));
  const requiredMethods = new Set([...required].filter(m => !DATA_MEMBERS.has(m)));
  const unimplemented = sorted(new Set([...requiredMethods].filter(m => !methods.has(m) && !absent.has(m))));
  const staleAbsent = sorted(new Set([...absent.keys()].filter(m => !requiredMethods.has(m))));
  const contradiction = sorted(new Set([...absent.keys()].filter(m => methods.has(m))));
  const surplus = sorted(new Set([...methods].filter(m => !requiredMethods.has(m))));
  // Every absence reason names every file its member is used in (T-27-11: a widened scope must re-check old reasons).
  const uncovered = [];
  for (const [m, reason] of absent) {
    const files = new Set([...(actor.sites.get(m) ?? []), ...(ext.sites.get(m) ?? [])]);
    for (const f of sorted(files)) if (!reason.includes(fileStem(f))) uncovered.push(`${m} @ ${fileStem(f)}`);
  }

  // gBrowserInit: the second comparison.
  const shellRequired = new Set([...deriveShimRequired([...actorFiles, ...extensionFiles])]);
  const shim = deriveShimImplemented(boundaryFile);
  if (shellRequired.size === 0) {
    return { ok: false, reason: 'empty-shim-required', detail: 'derived zero gBrowserInit member accesses' };
  }
  if (shim.members === null) {
    return { ok: false, reason: `shim-${shim.reason}`, detail: `${boundaryFile} (${shim.count} gBrowserInit definitions)` };
  }
  const shimUnimplemented = sorted([...shellRequired].filter(m => !shim.members.has(m)));
  const shimSurplus = sorted([...shim.members].filter(m => !shellRequired.has(m)));

  // Phase 32 plan 09: the zoom shims, the same comparison per shim.
  const zoomAbsent = inputs.zoomAbsent ?? ZOOM_SHIM_ABSENT;
  const zoomShims = [];
  for (const name of ZOOM_SHIMS) {
    const req = deriveZoomShimRequired(name, [...actorFiles, ...extensionFiles]);
    if (req.size === 0) {
      return { ok: false, reason: 'empty-zoom-required', detail: `derived zero ${name} member accesses` };
    }
    const zoomImpl = deriveZoomShimImplemented(boundaryFile, name);
    if (zoomImpl.members === null) {
      return { ok: false, reason: `zoom-shim-${zoomImpl.reason}`, detail: `${boundaryFile} (${name}: ${zoomImpl.count} definitions)` };
    }
    const absentOf = new Set([...zoomAbsent.keys()].filter(k => k.startsWith(`${name}.`)).map(k => k.slice(name.length + 1)));
    zoomShims.push({
      name,
      required: sorted(req),
      implemented: sorted(zoomImpl.members),
      absent: sorted(absentOf),
      unimplemented: sorted([...req].filter(m => !zoomImpl.members.has(m) && !absentOf.has(m))),
      staleAbsent: sorted([...absentOf].filter(m => !req.has(m))),
      contradiction: sorted([...absentOf].filter(m => zoomImpl.members.has(m))),
      surplus: sorted([...zoomImpl.members].filter(m => !req.has(m))),
    });
  }
  const zoomClean = zoomShims.every(
    shim => shim.unimplemented.length === 0 && shim.staleAbsent.length === 0 && shim.contradiction.length === 0 && shim.surplus.length === 0
  );

  return {
    ok:
      unimplemented.length === 0 &&
      staleAbsent.length === 0 &&
      contradiction.length === 0 &&
      surplus.length === 0 &&
      uncovered.length === 0 &&
      missingData.length === 0 &&
      staleData.length === 0 &&
      shimUnimplemented.length === 0 &&
      shimSurplus.length === 0 &&
      zoomClean,
    zoomShims,
    reason: '',
    fileCount: actorFiles.length,
    extensionFileCount: extensionFiles.length,
    required: sorted(requiredMethods),
    implemented: sorted(impl.members),
    methods: sorted(methods),
    absent: sorted(new Set(absent.keys())),
    unimplemented,
    staleAbsent,
    contradiction,
    surplus,
    uncovered,
    missingData,
    staleData,
    shellRequired: sorted(shellRequired),
    shimImplemented: sorted(shim.members),
    shimUnimplemented,
    shimSurplus,
    absentFor: absent,
  };
}

function reportFailure(result) {
  switch (result.reason) {
    case 'empty-upstream':
      console.error(`${NAME}: FAIL -- broken instrument: ${result.detail}. A set comparison over an empty upstream file list proves nothing.`);
      return;
    case 'empty-extension':
      console.error(`${NAME}: FAIL -- broken instrument: ${result.detail}. The extension scope must not be empty.`);
      return;
    case 'unreadable-upstream':
      console.error(`${NAME}: FAIL -- broken instrument: unreadable upstream call site(s): ${result.detail}`);
      return;
    case 'unreadable-patch':
      console.error(`${NAME}: FAIL -- broken instrument: cannot read ${result.detail}`);
      return;
    case 'empty-required':
      console.error(`${NAME}: FAIL -- broken instrument: ${result.detail}. An empty required set is a broken derivation, not a clean tree.`);
      return;
    case 'implemented-unreadable':
      console.error(`${NAME}: FAIL -- broken instrument: cannot read ${result.detail}`);
      return;
    case 'implemented-no-literal':
      console.error(`${NAME}: FAIL -- broken instrument: no balanced '${STANDIN_ANCHOR} = { ... }' object literal found in ${result.detail}`);
      return;
    case 'empty-implemented':
      console.error(`${NAME}: FAIL -- broken instrument: the ${STANDIN_ANCHOR} literal in ${result.detail} has no members at all`);
      return;
    case 'empty-shim-required':
      console.error(`${NAME}: FAIL -- broken instrument: ${result.detail}. An empty gBrowserInit set is a broken derivation.`);
      return;
    case 'shim-definitions':
      console.error(`${NAME}: FAIL -- broken instrument: ${result.detail}. Exactly one gBrowserInit shim definition is allowed, in the boundary file.`);
      return;
    case 'shim-no-literal':
      console.error(`${NAME}: FAIL -- broken instrument: no balanced '${SHIM_ANCHOR} ... }' literal found in ${result.detail}`);
      return;
    case 'shim-unreadable':
      console.error(`${NAME}: FAIL -- broken instrument: cannot read ${result.detail}`);
      return;
    case 'empty-zoom-required':
      console.error(`${NAME}: FAIL -- broken instrument: ${result.detail}. An empty zoom shim set is a broken derivation.`);
      return;
    case 'zoom-shim-definitions':
      console.error(`${NAME}: FAIL -- broken instrument: ${result.detail}. Exactly one definition of each zoom shim is allowed, in the boundary file.`);
      return;
    case 'zoom-shim-no-literal':
      console.error(`${NAME}: FAIL -- broken instrument: no balanced 'win.<zoom shim> = { ... }' literal found in ${result.detail}`);
      return;
    case 'zoom-shim-unreadable':
      console.error(`${NAME}: FAIL -- broken instrument: cannot read ${result.detail}`);
      return;
    default:
      break;
  }
  console.error(`${NAME}: FAIL -- the shell gBrowser stand-in or gBrowserInit shim does not match what upstream uses`);
  console.error(`  required gBrowser members (actor ${result.fileCount} files + extension ${result.extensionFileCount} files): ${result.required.join(', ')}`);
  console.error(`  implemented (derived from ${SHELL_FILE}): ${result.implemented.join(', ')}`);
  console.error(`  deliberately absent: ${result.absent.join(', ')}`);
  for (const m of result.unimplemented) {
    console.error(`  UNIMPLEMENTED: '${m}' is used on a gBrowser receiver upstream but the stand-in neither implements it nor records it in DELIBERATELY_ABSENT -- implement it, or record why it must stay absent`);
  }
  for (const m of result.staleAbsent) {
    console.error(`  STALE ABSENCE: '${m}' is in DELIBERATELY_ABSENT but nothing upstream uses it any more -- remove the entry (${result.absentFor.get(m)})`);
  }
  for (const m of result.contradiction) {
    console.error(`  CONTRADICTION: '${m}' is implemented on the stand-in AND listed in DELIBERATELY_ABSENT -- one of the two is wrong`);
  }
  for (const m of result.surplus) {
    console.error(`  DEAD SURFACE: '${m}' is implemented on the stand-in but nothing upstream uses it -- remove it rather than carry it`);
  }
  for (const m of result.uncovered ?? []) {
    console.error(`  UNCOVERED CALL SITE: '${m}' -- the DELIBERATELY_ABSENT reason does not name this call-site file; verify the outcome there and name it in the reason`);
  }
  for (const m of result.missingData) {
    console.error(`  MISSING DATA MEMBER: '${m}' -- ${DATA_MEMBERS.get(m).reason}`);
  }
  for (const m of result.staleData) {
    console.error(`  STALE DATA MEMBER: '${m}' -- ${patchLineReason(m)}`);
  }
  for (const m of result.shimUnimplemented) {
    console.error(`  UNIMPLEMENTED: 'gBrowserInit.${m}' is read upstream or by the shell, but the gBrowserInit shim in ${BOUNDARY_FILE} does not define it`);
  }
  for (const m of result.shimSurplus) {
    console.error(`  DEAD SURFACE: 'gBrowserInit.${m}' is defined by the shim but nothing reads it`);
  }
  for (const shim of result.zoomShims ?? []) {
    for (const m of shim.unimplemented) {
      console.error(`  UNIMPLEMENTED: '${shim.name}.${m}' is read upstream on the zoom shim, but the ${shim.name} literal in ${BOUNDARY_FILE} neither implements it nor records it in ZOOM_SHIM_ABSENT`);
    }
    for (const m of shim.staleAbsent) {
      console.error(`  STALE ABSENCE: '${shim.name}.${m}' is in ZOOM_SHIM_ABSENT but nothing upstream uses it any more`);
    }
    for (const m of shim.contradiction) {
      console.error(`  CONTRADICTION: '${shim.name}.${m}' is implemented on the zoom shim AND listed in ZOOM_SHIM_ABSENT -- one of the two is wrong`);
    }
    for (const m of shim.surplus) {
      console.error(`  DEAD SURFACE: '${shim.name}.${m}' is implemented on the zoom shim but nothing upstream reads it -- remove it rather than carry it`);
    }
  }
}

function patchLineReason(name) {
  return `${PATCH_FILE} no longer adds a line reading ${name}; the WebDriver path would go blind`;
}

// Resolve the actor scope to files, failing distinctly on an unreadable directory.
function actorFilesOrExit(scope, label) {
  const { files, unreadable, broken, uriEntries, uriDistinct } = deriveCallSiteFiles(scope);
  if (unreadable.length) {
    console.error(`${NAME}${label}: FAIL -- broken instrument: unreadable upstream actor director${unreadable.length > 1 ? 'ies' : 'y'} or registr${unreadable.length > 1 ? 'ies' : 'y'}: ${unreadable.join(', ')}`);
    process.exit(1);
  }
  if (broken.length) {
    console.error(`${NAME}${label}: FAIL -- broken instrument: ${broken.join('; ')}`);
    process.exit(1);
  }
  registryCounts = { uriEntries, uriDistinct };
  return files;
}
let registryCounts = { uriEntries: 0, uriDistinct: 0 };

function extensionFilesOrExit(label) {
  const { files, unreadable } = deriveExtensionFiles();
  if (unreadable.length || files.length === 0) {
    console.error(`${NAME}${label}: FAIL -- broken instrument: cannot derive the extension scope (${unreadable.join(', ') || 'zero files'})`);
    process.exit(1);
  }
  return files;
}

function currentInputs() {
  return {
    actorFiles: actorFilesOrExit(UPSTREAM_SCOPE, ''),
    extensionFiles: extensionFilesOrExit(''),
    shellFile: SHELL_FILE,
    boundaryFile: BOUNDARY_FILE,
    patchFile: PATCH_FILE,
  };
}

function main() {
  const inputs = currentInputs();
  const result = runScan(inputs);
  if (!result.ok) {
    reportFailure(result);
    process.exit(1);
  }
  console.log(
    `${NAME}: PASS -- gBrowser required {${result.required.join(', ')}} derived from ${result.fileCount} actor files (calls; ${registryCounts.uriEntries} registry parent entries, ${registryCounts.uriDistinct} distinct URIs) and ${result.extensionFileCount} extension files (every access) equals implemented {${result.methods.join(', ')}} plus deliberately absent {${result.absent.join(', ')}}; data member(s) {${[...DATA_MEMBERS.keys()].join(', ')}} present; gBrowserInit required {${result.shellRequired.join(', ')}} equals the shim {${result.shimImplemented.join(', ')}}; zoom shims ${result.zoomShims
      .map(shim => `${shim.name} {${shim.implemented.join(', ')}}${shim.absent.length ? ` with ${shim.absent.join(', ')} absent with reasons` : ''}`)
      .join('; ')}`
  );
}

function selfTest() {
  const real = currentInputs();
  const baseline = runScan(real);
  if (!baseline.ok) {
    console.error(`${NAME} --self-test: FAIL -- the unmodified tree is already red, so the planted-fault results below would be meaningless:`);
    reportFailure(baseline);
    process.exit(1);
  }
  console.log(`${NAME} --self-test: unmodified tree green -- gBrowser required {${baseline.required.join(', ')}} == implemented + absent over ${baseline.fileCount} actor and ${baseline.extensionFileCount} extension files; gBrowserInit {${baseline.shellRequired.join(', ')}}; planting faults`);

  const methods = baseline.methods;
  const victim = methods[0];
  const stage = mkdtempSync(join(tmpdir(), 'pb-gbrowser-standin-'));
  if (/\s/.test(stage)) throw new Error(`${NAME}: FAIL -- stage path contains a space: ${stage}`);
  let failed = 0;

  // A stand-in fixture from a member list: 'tabs' and 'webDriverTabs' are getters,
  // the rest methods, so a plant is unambiguous and exercises the real parser.
  const writeStandIn = (path, members) => {
    const body = members
      .map(m => (DATA_MEMBERS.has(m) ? `  get ${m}() { return null; },` : `  ${m}() { return null; },`))
      .join('\n');
    writeFileSync(path, `window.gBrowser = {\n${body}\n};\n`);
  };
  const fail = msg => {
    console.error(`${NAME} --self-test: FAIL -- ${msg}`);
    failed++;
  };
  const ok = msg => console.log(`  ok  ${msg}`);

  try {
    // (a) an implemented member removed from the stand-in.
    {
      const path = join(stage, 'standin-missing.js');
      writeStandIn(path, [...DATA_MEMBERS.keys(), ...methods.filter(m => m !== victim)]);
      const impl = deriveImplemented(path);
      if (!impl.members || impl.members.has(victim)) {
        fail(`'missing member' plant did not land (${victim} still parsed as implemented)`);
      } else {
        const r = runScan({ ...real, shellFile: path });
        if (r.ok || !r.unimplemented?.includes(victim)) {
          fail(`removing '${victim}' did not go red naming it; got: ${JSON.stringify({ reason: r.reason, unimplemented: r.unimplemented })}`);
        } else ok(`stand-in missing '${victim}' -> red, naming it UNIMPLEMENTED`);
      }
    }

    // (b) a staged copy of one actor-scope file gaining a new member call.
    {
      const planted = 'zzzPlantedRebaseMember';
      const source = real.actorFiles.find(p => p.endsWith('/LinkHandlerParent.sys.mjs')) ?? real.actorFiles[0];
      const path = join(stage, 'upstream-new-call.sys.mjs');
      writeFileSync(path, `${readSource(source)}\nfunction plantedRebase(gBrowser, tab) {\n  return gBrowser.${planted}(tab);\n}\n`);
      if (!readFileSync(path, 'utf8').includes(`gBrowser.${planted}(`)) {
        fail(`'new upstream call' plant did not land`);
      } else {
        const r = runScan({ ...real, actorFiles: [path, ...real.actorFiles.filter(p => p !== source)] });
        if (r.ok || !r.unimplemented?.includes(planted)) {
          fail(`a new upstream member call did not go red naming '${planted}'; got: ${JSON.stringify({ reason: r.reason, unimplemented: r.unimplemented })}`);
        } else ok(`upstream rebase adding '${planted}' to ${source.split('/').pop()} -> red, naming it UNIMPLEMENTED`);
      }
    }

    // (c) a surplus stand-in member nothing upstream uses.
    {
      const planted = 'zzzDeadSurfaceMember';
      const path = join(stage, 'standin-surplus.js');
      writeStandIn(path, [...DATA_MEMBERS.keys(), ...methods, planted]);
      const impl = deriveImplemented(path);
      if (!impl.members || !impl.members.has(planted)) {
        fail(`'surplus member' plant did not land`);
      } else {
        const r = runScan({ ...real, shellFile: path });
        if (r.ok || !r.surplus?.includes(planted)) {
          fail(`a surplus stand-in member did not go red naming '${planted}'; got: ${JSON.stringify({ reason: r.reason, surplus: r.surplus })}`);
        } else ok(`stand-in surplus '${planted}' -> red, naming it DEAD SURFACE`);
      }
    }

    // (d) an empty actor-scope file list is a broken instrument, never clean.
    {
      const r = runScan({ ...real, actorFiles: [] });
      if (r.ok || r.reason !== 'empty-upstream') {
        fail(`an empty actor-scope file list did not fail distinctly as a broken instrument; got reason='${r.reason}'`);
      } else ok(`empty actor-scope file list -> distinct broken-instrument failure, not clean`);
    }

    // (e) a NEW caller file in a copy of a scanned actor directory: the file list is derived.
    {
      const planted = 'zzzNewActorParentMember';
      const [dir] = UPSTREAM_SCOPE.dirs[0];
      const copy = join(stage, 'actors-copy');
      cpSync(join(REPO_ROOT, dir), copy, { recursive: true });
      const newFile = `ZzzPlanted${PARENT_SUFFIX}`;
      writeFileSync(
        join(copy, newFile),
        `export class ZzzPlantedParent extends JSWindowActorParent {\n  receiveMessage() {\n    this.browsingContext.top.embedderElement.documentGlobal.gBrowser.${planted}(this);\n  }\n}\n`
      );
      const scope = { files: UPSTREAM_SCOPE.files, dirs: [[copy, 'self-test copy'], ...UPSTREAM_SCOPE.dirs.slice(1)] };
      const { files } = deriveCallSiteFiles(scope);
      if (!files.includes(`${copy}/${newFile}`)) {
        fail(`'new caller file' plant did not land (${newFile} not in the derived file list)`);
      } else {
        const r = runScan({ ...real, actorFiles: files });
        if (r.ok || !r.unimplemented?.includes(planted)) {
          fail(`a new actor parent calling '${planted}' did not go red naming it; got: ${JSON.stringify({ reason: r.reason, unimplemented: r.unimplemented })}`);
        } else ok(`new caller file ${newFile} in a copy of ${dir} -> red, naming '${planted}' UNIMPLEMENTED`);
      }
    }

    // (f) a stale entry in a copy of DELIBERATELY_ABSENT.
    {
      const planted = 'zzzStaleAbsentMember';
      const absent = new Map([...DELIBERATELY_ABSENT, [planted, 'self-test stale entry']]);
      const r = runScan({ ...real, absent });
      if (r.ok || !r.staleAbsent?.includes(planted)) {
        fail(`a stale DELIBERATELY_ABSENT entry did not go red naming '${planted}'; got: ${JSON.stringify({ reason: r.reason, staleAbsent: r.staleAbsent })}`);
      } else ok(`DELIBERATELY_ABSENT carrying '${planted}' -> red, naming it STALE ABSENCE`);
    }

    // (g) an implemented member also listed absent.
    {
      const absent = new Map([...DELIBERATELY_ABSENT, [victim, 'self-test contradiction']]);
      const r = runScan({ ...real, absent });
      if (r.ok || !r.contradiction?.includes(victim)) {
        fail(`'${victim}' both implemented and listed absent did not go red naming it; got: ${JSON.stringify({ reason: r.reason, contradiction: r.contradiction })}`);
      } else ok(`'${victim}' implemented and listed absent -> red, naming it CONTRADICTION`);
    }

    // Positive control on the data members: dropping `tabs` is red too.
    {
      const path = join(stage, 'standin-no-tabs.js');
      writeStandIn(path, [DATA_MEMBERS.keys().next().value === 'tabs' ? 'webDriverTabs' : 'tabs', ...methods]);
      const r = runScan({ ...real, shellFile: path });
      if (r.ok || !r.missingData?.includes('tabs')) {
        fail(`dropping the 'tabs' data member did not go red naming it; got: ${JSON.stringify({ reason: r.reason, missingData: r.missingData })}`);
      } else ok(`stand-in missing 'tabs' -> red, naming it MISSING DATA MEMBER`);
    }

    // (p) a staged extension-scope copy that only READS gBrowser.zzzPlantedRead.
    {
      const planted = 'zzzPlantedRead';
      const path = join(stage, 'extension-read.js');
      writeFileSync(path, `export function plantedRead(win) {\n  return win.gBrowser.${planted};\n}\n`);
      const r = runScan({ ...real, extensionFiles: [...real.extensionFiles, path] });
      if (r.ok || !r.unimplemented?.includes(planted)) {
        fail(`an extension-scope read of '${planted}' did not go red naming it; got: ${JSON.stringify({ reason: r.reason, unimplemented: r.unimplemented })}`);
      } else ok(`extension-scope read of '${planted}' -> red, naming it UNIMPLEMENTED (reads count in the extension scope)`);
    }

    // (q) an actor parent calling through a bound getTabBrowser() receiver.
    {
      const planted = 'zzzPlantedViaReceiver';
      const path = join(stage, 'actor-receiver.sys.mjs');
      writeFileSync(path, `export function plantedReceiver(browser, x) {\n  let tb = browser.getTabBrowser();\n  tb.${planted}(x);\n}\n`);
      const r = runScan({ ...real, actorFiles: [...real.actorFiles, path] });
      if (r.ok || !r.unimplemented?.includes(planted)) {
        fail(`a call through a bound getTabBrowser() receiver did not go red naming '${planted}'; got: ${JSON.stringify({ reason: r.reason, unimplemented: r.unimplemented })}`);
      } else ok(`call through bound getTabBrowser() receiver '${planted}' -> red, naming it UNIMPLEMENTED (receiver widening)`);
    }

    // (r) a gBrowserInit literal without isAdoptingTab.
    {
      // The real boundary file with isAdoptingTab removed from its gBrowserInit line; the zoom shims stay, so only this plant goes red.
      const path = join(stage, 'boundary-no-adopting.mjs');
      const boundaryText = readSource(BOUNDARY_FILE) ?? '';
      const withoutAdopting = boundaryText.replace(/win\.gBrowserInit = \{[^\n]*\};/, 'win.gBrowserInit = { delayedStartupFinished: true, getTabToAdopt: () => null };');
      if (withoutAdopting === boundaryText) throw new Error(`${NAME}: FAIL -- the gBrowserInit line was not found in ${BOUNDARY_FILE}`);
      writeFileSync(path, withoutAdopting);
      const r = runScan({ ...real, boundaryFile: path });
      if (r.ok || !r.shimUnimplemented?.includes('isAdoptingTab')) {
        fail(`a gBrowserInit literal without isAdoptingTab did not go red naming 'gBrowserInit.isAdoptingTab'; got: ${JSON.stringify({ reason: r.reason, shimUnimplemented: r.shimUnimplemented })}`);
      } else ok(`gBrowserInit literal without isAdoptingTab -> red, naming 'gBrowserInit.isAdoptingTab' UNIMPLEMENTED`);
    }

    // (s) staged patch text without the TabManager hunk.
    {
      const path = join(stage, 'patch-no-webdrivertabs.patch');
      const patch = readSource(PATCH_FILE) ?? '';
      writeFileSync(path, patch.split('\n').filter(line => !/^\+.*\btabBrowser\.webDriverTabs\b/.test(line)).join('\n'));
      const r = runScan({ ...real, patchFile: path });
      if (r.ok || !r.staleData?.includes('webDriverTabs')) {
        fail(`patch text without the webDriverTabs hunk did not go red naming it; got: ${JSON.stringify({ reason: r.reason, staleData: r.staleData })}`);
      } else ok(`050 patch text without the TabManager hunk -> red, naming STALE DATA MEMBER 'webDriverTabs'`);
    }

    // (t) a staged ZoomManager literal without MIN.
    {
      const src = readSource(BOUNDARY_FILE) ?? '';
      const path = join(stage, 'boundary-zoom-no-min.mjs');
      writeFileSync(path, src.split('\n').filter(line => !/^\s*get MIN\(\)/.test(line)).join('\n'));
      if (/get MIN\(\)/.test(readFileSync(path, 'utf8'))) {
        fail(`'ZoomManager without MIN' plant did not land (MIN still defined)`);
      } else {
        const r = runScan({ ...real, boundaryFile: path });
        const shim = r.zoomShims?.find(x => x.name === 'ZoomManager');
        if (r.ok || !shim?.unimplemented.includes('MIN')) {
          fail(`a ZoomManager literal without MIN did not go red naming 'ZoomManager.MIN'; got: ${JSON.stringify({ reason: r.reason, unimplemented: shim?.unimplemented })}`);
        } else ok(`staged ZoomManager literal without MIN -> red, naming 'ZoomManager.MIN' UNIMPLEMENTED`);
      }
    }

    // (u) a staged FullZoom literal with a surplus zoomIn.
    {
      const src = readSource(BOUNDARY_FILE) ?? '';
      const anchor = 'siteSpecific: false,';
      const path = join(stage, 'boundary-zoom-surplus.mjs');
      if (src.split(anchor).length !== 2) {
        fail(`the FullZoom literal anchor '${anchor}' is not unique in ${BOUNDARY_FILE}; the surplus plant cannot land`);
      } else {
        writeFileSync(path, src.replace(anchor, `${anchor}\n      zoomIn() { return null; },`));
        const r = runScan({ ...real, boundaryFile: path });
        const shim = r.zoomShims?.find(x => x.name === 'FullZoom');
        if (r.ok || !shim?.surplus.includes('zoomIn')) {
          fail(`a FullZoom literal with surplus zoomIn did not go red naming 'FullZoom.zoomIn'; got: ${JSON.stringify({ reason: r.reason, surplus: shim?.surplus })}`);
        } else ok(`staged FullZoom literal with surplus zoomIn -> red, naming 'FullZoom.zoomIn' DEAD SURFACE`);
      }
    }

    // (v) FullZoom.reset's absence reason removed.
    {
      const zoomAbsent = new Map([...ZOOM_SHIM_ABSENT].filter(([k]) => k !== 'FullZoom.reset'));
      const r = runScan({ ...real, zoomAbsent });
      const shim = r.zoomShims?.find(x => x.name === 'FullZoom');
      if (r.ok || !shim?.unimplemented.includes('reset')) {
        fail(`FullZoom.reset with its reason removed did not go red naming 'FullZoom.reset'; got: ${JSON.stringify({ reason: r.reason, unimplemented: shim?.unimplemented })}`);
      } else ok(`FullZoom.reset with no absence reason -> red, naming 'FullZoom.reset' UNIMPLEMENTED`);
    }

    // (w) two staged ZoomUI definitions: a broken instrument, never a clean comparison.
    {
      const src = readSource(BOUNDARY_FILE) ?? '';
      const path = join(stage, 'boundary-zoom-twice.mjs');
      writeFileSync(path, `${src}\nwin.ZoomUI = { getGlobalValue() { return 1; } };\n`);
      const r = runScan({ ...real, boundaryFile: path });
      if (r.ok || r.reason !== 'zoom-shim-definitions' || !String(r.detail).includes('ZoomUI')) {
        fail(`two ZoomUI definitions did not fail as a broken instrument naming ZoomUI; got: ${JSON.stringify({ reason: r.reason, detail: r.detail })}`);
      } else ok(`two staged 'win.ZoomUI = {' definitions -> broken instrument naming ZoomUI`);
    }

    // (h) a component-parent plant: a staged DesktopActorRegistry copy names a module outside the scanned directories.
    {
      const planted = 'zzzPlantedComponentMember';
      const [registry, why] = UPSTREAM_SCOPE.registries[0];
      const regCopy = join(stage, 'DesktopActorRegistry.sys.mjs');
      const moduleFile = join(stage, 'components', 'zzzplanted', 'ZzzPlantedComponentModule.sys.mjs');
      const entry = `  ZzzPlanted: {\n    parent: {\n      esModuleURI: "resource:///modules/ZzzPlantedComponentModule.sys.mjs",\n    },\n  },\n`;
      const regText = readSource(registry) ?? '';
      writeFileSync(regCopy, regText.replace(/^  Profiles: \{$/m, `${entry}  Profiles: {`));
      mkdirSync(dirname(moduleFile), { recursive: true });
      writeFileSync(moduleFile, `export const ZzzPlanted = {\n  open(win) {\n    win.gBrowser.${planted}(win);\n  },\n};\n`);
      const scope = { ...UPSTREAM_SCOPE, registries: [[regCopy, why], ...UPSTREAM_SCOPE.registries.slice(1)] };
      const fileList = [...upstreamFileList(), moduleFile];
      const derived = deriveCallSiteFiles(scope, fileList);
      const dirsOnly = deriveCallSiteFiles({ ...scope, registries: [] }, fileList);
      if (!derived.files.includes(moduleFile) || dirsOnly.files.includes(moduleFile) || derived.broken.length) {
        fail(`'component parent' plant did not land (in registry scope: ${derived.files.includes(moduleFile)}, reachable by the directory scan: ${dirsOnly.files.includes(moduleFile)}, broken: ${derived.broken.join('; ')})`);
      } else {
        const r = runScan({ ...real, actorFiles: derived.files });
        if (r.ok || !r.unimplemented?.includes(planted)) {
          fail(`a registry-named parent module calling '${planted}' did not go red naming it; got: ${JSON.stringify({ reason: r.reason, unimplemented: r.unimplemented })}`);
        } else ok(`registry entry naming a module outside the scanned directories -> red, naming '${planted}' UNIMPLEMENTED (registry derivation only)`);
      }
    }

    // (i) a staged registry entry whose basename matches no file: a broken instrument naming the URI.
    {
      const uri = 'resource:///modules/ZzzNoSuchParent.sys.mjs';
      const [registry, why] = UPSTREAM_SCOPE.registries[1];
      const regCopy = join(stage, 'ActorManagerParent.sys.mjs');
      const regText = readSource(registry) ?? '';
      const at = regText.indexOf('parent: {');
      writeFileSync(regCopy, at === -1 ? regText : `${regText.slice(0, at)}parent: { esModuleURI: "${uri}" },\n    unusedParent: {${regText.slice(at + 'parent: {'.length)}`);
      if (!(registryParentURIs(regCopy) ?? []).includes(uri)) {
        fail(`'unresolvable URI' plant did not land (${uri} not parsed from the staged registry)`);
      } else {
        const derived = deriveCallSiteFiles({ ...UPSTREAM_SCOPE, registries: [UPSTREAM_SCOPE.registries[0], [regCopy, why]] });
        if (!derived.broken.some(b => b.includes(uri))) {
          fail(`a registry URI resolving to no file did not fail as a broken instrument naming it; got: ${JSON.stringify(derived.broken)}`);
        } else ok(`registry URI ${uri} resolving to no file -> broken instrument naming the URI`);
      }
    }

    // (o) an absence reason naming only one of its member's call-site files.
    {
      const victimAbsent = baseline.absent.find(m => {
        const reason = DELIBERATELY_ABSENT.get(m);
        return (reason.match(/[A-Za-z][\w-]*Parent\b/g) ?? []).length >= 2;
      });
      const first = (DELIBERATELY_ABSENT.get(victimAbsent) ?? '').match(/[A-Za-z][\w-]*Parent\b/)?.[0];
      if (!victimAbsent || !first) {
        fail(`'uncovered call site' plant did not land (no absence reason names two call-site files)`);
      } else {
        const absent = new Map([...DELIBERATELY_ABSENT, [victimAbsent, `${first} calls it (self-test reason naming one call site)`]]);
        const r = runScan({ ...real, absent });
        if (r.ok || !r.uncovered?.some(u => u.startsWith(`${victimAbsent} @ `))) {
          fail(`a '${victimAbsent}' reason naming only ${first} did not go red; got: ${JSON.stringify({ reason: r.reason, uncovered: r.uncovered })}`);
        } else ok(`'${victimAbsent}' reason naming only ${first} -> red, naming UNCOVERED CALL SITE ${r.uncovered.filter(u => u.startsWith(`${victimAbsent} @ `)).join(', ')}`);
      }
    }
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }

  if (failed) process.exit(1);
  console.log(
    `${NAME} --self-test: PASS -- every planted fault landed and went red naming its drift (missing member, new upstream call, surplus member, new caller file, stale absence, contradiction, missing data member, extension-scope read, receiver call, gBrowserInit member, stale patch hunk, zoom shim MIN / surplus zoomIn / absent reason / duplicate ZoomUI, registry-named component parent, uncovered call site); the empty file list and an unresolvable registry URI failed distinctly`
  );
}

// deriveImplemented and deriveZoomShimImplemented are exported for verify-ext-tab-host-scope.mjs (its host:
// claims run these same literal parsers). Importing the module runs nothing.
export { deriveImplemented, deriveZoomShimImplemented };

const IS_ENTRY = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_ENTRY) {
  if (process.argv.includes('--self-test')) {
    selfTest();
  } else {
    main();
  }
}
