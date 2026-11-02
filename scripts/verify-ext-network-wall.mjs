#!/usr/bin/env node
// scripts/verify-ext-network-wall.mjs
//
// UF-31.1-02 gate (plan 38-06). Patch 060 keeps the Theia frame out of every extension network observer and keeps
// the token cookie out of browser.cookies. This gate goes red when any part of that wall is removed or weakened.
//
// Families:
//   wall       WebRequest.sys.mjs and ProxyChannelFilter.sys.mjs each define one helper that reads one attribute
//              off the channel's top-level browser element, and every function in those files that matches a channel
//              against an extension filter (`<channel>.matches(`) returns early on that helper first, in a block that
//              still encloses the match. runChannelListener carries webRequest and declarativeNetRequest; the
//              AuthRequestor hook goes through shouldHookListener; proxy.onRequest goes through applyFilter.
//   consumers  every upstream extension file that obtains a ChannelWrapper is walled, or carries a reason here.
//   cookies    ext-cookies.js defines one helper over one pref; every allowedOrigins.matchesCookie site joins it
//              with the right connective, and every checkSetCookiePermissions call is refused on it first.
//   frame      the Theia frame in powerbrowser.xhtml carries the attribute the helpers read, and nothing else under
//              powerbrowser/shell writes it (an overlay carrying it would hide a web tab from webRequest).
//              Each helper also hands a browserless channel's loading principal (a service or shared worker's own) to
//              an origin helper over one pref; both files read the same pref.
//   origins    PowerBrowserAPI.setGroupSenderPort writes that pref on the default branch to exactly the sidecar origin
//              (host from TheiaService's --hostname) and Theia's webview origin pattern (read from the installed
//              @theia/plugin-ext defaultPattern, {{uuid}} as a wildcard), with no endpoint override in TheiaService.
//   pref       powerbrowser-sidecar.js sets the cookies pref to the name and host TheiaService gives the token cookie,
//              and that name is PowerBrowserAPI's TOKEN_COOKIE_NAME.
//
// What is derived, and from what: the post-image is patch 060 applied to the PRISTINE upstream bytes
// (git -C upstream show HEAD:<path>) inside a mktemp -d directory, so the answer is the same with or without 060
// applied in upstream/. The helper names, the attribute and the pref name are read from that post-image; the set of
// channel-matching functions is derived from it; the consumer set comes from git grep over upstream HEAD. The cookie
// name and host come from the shell sources. The hand-kept content is WALLED and EXEMPT below, each with a reason.
//
// Honestly --quick: text reads, read-only git show and git grep, and a patch applied only inside mktemp -d.
// --self-test requires the clean tree green, then plants faults and requires each to go red naming its drift.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = 'verify-ext-network-wall';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PATCH = join(ROOT, 'patches', '060-extension-network-wall.patch');
const UPSTREAM = join(ROOT, 'upstream');
const WEBREQUEST = 'toolkit/components/extensions/webrequest/WebRequest.sys.mjs';
const PROXY = 'toolkit/components/extensions/ProxyChannelFilter.sys.mjs';
const COOKIES = 'toolkit/components/extensions/parent/ext-cookies.js';
const XHTML_REL = 'powerbrowser/shell/powerbrowser.xhtml';
const SIDECAR_REL = 'powerbrowser/shell/powerbrowser-sidecar.js';
const API_REL = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';
const THEIA_REL = 'powerbrowser/shell/TheiaService.sys.mjs';
const EXT_DIRS = ['toolkit/components/extensions', 'browser/components/extensions'];
const WEBVIEW_PROTOCOL_REL = 'theia/node_modules/@theia/plugin-ext/lib/main/common/webview-protocol.js';

// The files whose channel matching must be walled (family wall).
const WALLED = [WEBREQUEST, PROXY];
// ChannelWrapper consumers that are not walled, each with the reason it needs no wall.
const EXEMPT = {
  'toolkit/components/extensions/parent/ext-identity.js':
    'launchWebAuthFlow reads only channels whose browserElement is its own auth popup\'s selectedBrowser, and reports nothing about any other channel',
};

const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'with', 'return', 'function']);
const ind = s => s.length - s.trimStart().length;
const isComment = t => t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('<!--');

// ---- inputs ----------------------------------------------------------------

function gitShow(path) {
  return execFileSync('git', ['-C', UPSTREAM, 'show', `HEAD:${path}`], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

function patchTargets(text) {
  return [...text.matchAll(/^\+\+\+ b\/(.+)$/gm)].map(m => m[1]);
}

// Applies the patch to the pristine bytes in mktemp -d; returns Map path -> post-image text.
function derivePost(patchText) {
  const dir = mkdtempSync(join(tmpdir(), 'ext-network-wall-'));
  try {
    const targets = patchTargets(patchText);
    const files = new Set([...WALLED, COOKIES, ...targets]);
    for (const p of files) {
      mkdirSync(dirname(join(dir, p)), { recursive: true });
      writeFileSync(join(dir, p), gitShow(p));
    }
    if (targets.length) {
      writeFileSync(join(dir, '.patch'), patchText);
      execFileSync('git', ['apply', '.patch'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    }
    const post = new Map();
    for (const p of files) post.set(p, readFileSync(join(dir, p), 'utf8'));
    return post;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function deriveConsumers() {
  let out = '';
  try {
    out = execFileSync('git', ['-C', UPSTREAM, 'grep', '-l', '-E', 'ChannelWrapper\\.(get|getRegisteredChannel)\\(', 'HEAD', '--', ...EXT_DIRS],
      { encoding: 'utf8' });
  } catch (e) {
    if (e.status !== 1) throw e;
  }
  return new Set(out.split('\n').filter(Boolean).map(l => l.replace(/^HEAD:/, '')).filter(p => !/\/test\//.test(p)));
}

function shellFiles() {
  const rels = execFileSync('git', ['-C', ROOT, 'ls-files', 'powerbrowser/shell'], { encoding: 'utf8' })
    .split('\n').filter(r => /\.(xhtml|js|mjs)$/.test(r));
  return new Map(rels.map(r => [r, readFileSync(join(ROOT, r), 'utf8')]));
}

function loadInputs() {
  const patchText = readFileSync(PATCH, 'utf8');
  return { patchText, post: derivePost(patchText), consumers: deriveConsumers(), shell: shellFiles(), webviewProtocol: readFileSync(join(ROOT, WEBVIEW_PROTOCOL_REL), 'utf8') };
}

// ---- structure -------------------------------------------------------------

function defName(t) {
  let m = /^(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/.exec(t);
  if (m) return m[1];
  m = /^(?:(?:async|static|get|set)\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{$/.exec(t);
  if (m) return KEYWORDS.has(m[1]) ? null : m[1];
  m = /^([A-Za-z_$][\w$]*)\s*:\s*(?:async\s+)?function\b/.exec(t);
  if (m) return m[1];
  return null;
}

// The innermost named definition enclosing lines[idx], by the indentation-ancestor walk.
function enclosingDef(lines, idx) {
  let last = ind(lines[idx]);
  for (let i = idx - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (t === '' || isComment(t)) continue;
    if (ind(lines[i]) < last) {
      last = ind(lines[i]);
      const name = defName(t);
      if (name) return { name, line: i };
    }
  }
  return null;
}

// A wall between def and idx: `if (<test>) {` then a return, in a block that is still open at idx.
function wallBefore(lines, def, idx, testRe) {
  for (let i = def + 1; i < idx; i++) {
    if (!testRe.test(lines[i])) continue;
    const w = ind(lines[i]);
    const next = lines.slice(i + 1).find(l => l.trim() !== '');
    if (!next || !/^\s*return\b/.test(next) || ind(next) <= w) continue;
    let open = true;
    for (let j = i + 1; j < idx; j++) {
      if (lines[j].trim() !== '' && ind(lines[j]) < w) { open = false; break; }
    }
    if (open) return i;
  }
  return -1;
}

// ---- the check -------------------------------------------------------------

function check(inp) {
  const out = { failures: [], passes: [] };
  const fail = (family, id, kind, text) => out.failures.push({ family, id, kind, text });

  // wall
  const attrs = new Map();
  const originPrefs = new Map();
  for (const file of WALLED) {
    const lines = inp.post.get(file).split('\n');
    const helpers = [];
    const bodyOf = i => {
      const end = lines.findIndex((l, j) => j > i && l === '}');
      return lines.slice(i + 1, end < 0 ? i + 1 : end).join('\n');
    };
    const fns = new Map();
    lines.forEach((l, i) => {
      const m = /^function ([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\) \{$/.exec(l);
      if (m) fns.set(m[1], { param: m[2], body: bodyOf(i) });
    });
    for (const [name, { param, body }] of fns) {
      const a = new RegExp(`let browser = ${param}\\.browserElement;\\n\\s*if \\(browser\\) \\{\\n\\s*return browser\\.hasAttribute\\("([a-z]+)"\\);`).exec(body);
      if (a) helpers.push({ name, attr: a[1], body });
    }
    if (helpers.length !== 1) {
      fail('wall', file, 'HELPER', `${file} defines ${helpers.length} browser-element attribute helpers (need exactly one): patch 060 does not carry its wall here`);
      continue;
    }
    const [{ name: helper, attr, body: hbody }] = helpers;
    attrs.set(file, attr);
    // The worker branch: a channel with no browser falls to an origin helper over a pref, on its loading principal.
    const call = /return ([A-Za-z_$][\w$]*)\(\s*loadInfo\?\.loadingPrincipal\b/.exec(hbody);
    const og = call && fns.get(call[1]);
    const opref = og && /getStringPref\("([\w.]+)", ""\)/.exec(og.body);
    if (!og || !opref || !og.body.includes('.isContentPrincipal') || !og.body.includes('.originNoSuffix') || !og.body.includes('.split(",")')) {
      fail('wall', file, 'WORKER BRANCH', `${file} ${helper} does not hand a browserless channel's loading principal to an origin helper over a pref: Theia's service and shared workers would reach extensions`);
    } else {
      originPrefs.set(file, opref[1]);
    }
    const sites = [];
    lines.forEach((l, i) => {
      const m = /\b([A-Za-z_$][\w$]*)\.matches\(/.exec(l);
      if (!m || isComment(l.trim()) || !['channel', 'wrapper'].includes(m[1])) return;
      const def = enclosingDef(lines, i);
      const site = def ? def.name : `<top level>:${i + 1}`;
      sites.push(site);
      const testRe = new RegExp(`^\\s*if \\(${helper}\\(${m[1]}\\)\\) \\{\\s*$`);
      if (!def || wallBefore(lines, def.line, i, testRe) < 0) {
        fail('wall', `${file}:${site}`, 'UNWALLED MATCH', `${file} ${site} matches a channel at line ${i + 1} without first returning on ${helper}(${m[1]}): the Theia frame's requests would reach extensions there`);
      }
    });
    if (!sites.length) fail('wall', file, 'NO MATCH SITE', `${file} has no channel.matches( site: the derivation is blind`);
    else out.passes.push(`wall PASS -- ${file}: ${helper} reads "${attr}"; walled: ${sites.join(', ')}`);
  }
  const attrSet = new Set(attrs.values());
  if (attrSet.size > 1) fail('wall', 'attribute', 'ATTRIBUTE MISMATCH', `the wall helpers read different attributes: ${[...attrs].map(([f, a]) => `${f} "${a}"`).join(', ')}`);
  const attr = attrSet.size === 1 ? [...attrSet][0] : null;
  const oprefSet = new Set(originPrefs.values());
  if (oprefSet.size > 1) fail('wall', 'origins pref', 'PREF MISMATCH', `the origin helpers read different prefs: ${[...originPrefs].map(([f, a]) => `${f} "${a}"`).join(', ')}`);
  const originsPref = oprefSet.size === 1 && originPrefs.size === WALLED.length ? [...oprefSet][0] : null;

  // consumers
  const accounted = new Set([...WALLED, ...Object.keys(EXEMPT)]);
  for (const c of inp.consumers) {
    if (!accounted.has(c)) fail('consumers', c, 'UNACCOUNTED CONSUMER', `${c} obtains a ChannelWrapper and is neither walled nor exempt with a reason`);
  }
  for (const a of accounted) {
    if (!inp.consumers.has(a)) fail('consumers', a, 'STALE ENTRY', `${a} is listed as a ChannelWrapper consumer but no longer obtains one`);
  }
  if (!out.failures.some(f => f.family === 'consumers')) out.passes.push(`consumers PASS -- ${inp.consumers.size} ChannelWrapper consumer(s): ${WALLED.length} walled, ${Object.keys(EXEMPT).length} exempt with a reason`);

  // cookies
  const clines = inp.post.get(COOKIES).split('\n');
  const chelpers = [];
  clines.forEach((l, i) => {
    const m = /^function ([A-Za-z_$][\w$]*)\(name, host\) \{$/.exec(l);
    if (!m) return;
    const body = clines.slice(i + 1, i + 6).join('\n');
    const p = /getStringPref\("([\w.]+)", ""\)/.exec(body);
    if (p && body.includes('.split(",")') && body.includes('.includes(`${name}@${host}`)')) chelpers.push({ name: m[1], pref: p[1] });
  });
  let prefName = null;
  if (chelpers.length !== 1) {
    fail('cookies', COOKIES, 'HELPER', `${COOKIES} defines ${chelpers.length} hidden-cookie helpers over a pref (need exactly one): patch 060 does not carry its cookie wall`);
  } else {
    const [{ name: ch }] = chelpers;
    prefName = chelpers[0].pref;
    let reads = 0;
    clines.forEach((l, i) => {
      if (!/allowedOrigins\.matchesCookie\(/.test(l) || isComment(l.trim())) return;
      reads++;
      const def = enclosingDef(clines, i);
      const site = `${def ? def.name : 'top'}:${i + 1}`;
      const next = (clines[i + 1] || '').trim();
      const negated = /!\s*(?:this\.|context\.)?extension\.allowedOrigins\.matchesCookie\(cookie\) \|\|$/.test(l.trim());
      const positive = /^(?:if \()?(?:this\.|context\.)?extension\.allowedOrigins\.matchesCookie\(cookie\) &&$/.test(l.trim());
      const ok = (negated && next === `${ch}(cookie.name, cookie.rawHost)`) || (positive && next === `!${ch}(cookie.name, cookie.rawHost)`);
      if (!ok) fail('cookies', `${COOKIES}:${site}`, 'UNWALLED READ', `${COOKIES} ${site} admits a cookie on allowedOrigins.matchesCookie without excluding ${ch}(cookie.name, cookie.rawHost) in the same condition: the token cookie would reach extensions there`);
    });
    let sets = 0;
    clines.forEach((l, i) => {
      if (!/!checkSetCookiePermissions\(/.test(l)) return;
      sets++;
      const prev = (clines[i - 1] || '').trim();
      if (!(prev.startsWith(`${ch}(name, `) && prev.includes('details.domain ?? uri.host') && prev.endsWith(') ||'))) {
        fail('cookies', `${COOKIES}:${i + 1}`, 'UNWALLED WRITE', `${COOKIES}:${i + 1} checks a cookie write without first refusing ${ch}(name, details.domain ?? uri.host): an extension could overwrite the token cookie`);
      }
    });
    if (!reads || !sets) fail('cookies', COOKIES, 'NO SITE', `${COOKIES} has ${reads} matchesCookie and ${sets} checkSetCookiePermissions sites: the derivation is blind`);
    if (!out.failures.some(f => f.family === 'cookies')) out.passes.push(`cookies PASS -- ${ch} over pref ${prefName}: ${reads} read site(s) and ${sets} write site(s) walled`);
  }

  // frame
  if (attr) {
    const frames = [];
    const writes = [];
    for (const [rel, text] of inp.shell) {
      text.split('\n').forEach((l, i) => {
        if (/<xul:browser\b[^>]*\bid="powerbrowser-content"/.test(l)) frames.push({ rel, i, l });
        if (l.includes(attr) && !isComment(l.trim())) writes.push({ rel, i, l });
      });
    }
    if (frames.length !== 1) {
      fail('frame', 'powerbrowser-content', 'BROKEN', `${frames.length} xul:browser elements with id powerbrowser-content (need exactly one)`);
    } else {
      const f = frames[0];
      if (!f.l.includes(` ${attr}="true"`)) fail('frame', 'powerbrowser-content', 'FRAME UNMARKED', `${f.rel}:${f.i + 1} the Theia frame does not carry ${attr}="true": its requests reach every webRequest listener`);
      for (const w of writes) {
        if (w.rel === f.rel && w.i === f.i) continue;
        fail('frame', `${w.rel}:${w.i + 1}`, 'WRITE SITE', `${w.rel}:${w.i + 1} names ${attr} outside the Theia frame element: a web tab carrying it would vanish from webRequest`);
      }
      if (!out.failures.some(x => x.family === 'frame')) out.passes.push(`frame PASS -- ${f.rel}:${f.i + 1} carries ${attr}="true"; no other powerbrowser/shell line names it`);
    }
  }

  // pref
  if (prefName) {
    const side = inp.shell.get(SIDECAR_REL) || '';
    const prefs = [...side.matchAll(new RegExp(`^pref\\("${prefName.replace(/\./g, '\\.')}", "([^"]*)"\\);$`, 'gm'))].map(m => m[1]);
    const tokenName = /^const TOKEN_COOKIE_NAME = "([^"]+)";$/m.exec(inp.shell.get(API_REL) || '');
    const call = /setSessionCookie\(\{\s*host: "([^"]+)",\s*path: "[^"]*",\s*name: "([^"]+)",/.exec(inp.shell.get(THEIA_REL) || '');
    if (!tokenName || !call) {
      fail('pref', 'token cookie', 'BROKEN', `could not derive the token cookie (TOKEN_COOKIE_NAME in ${API_REL}: ${!!tokenName}; setSessionCookie in ${THEIA_REL}: ${!!call})`);
    } else if (call[2] !== tokenName[1]) {
      fail('pref', 'token cookie', 'NAME MISMATCH', `TheiaService sets cookie ${call[2]} but PowerBrowserAPI's TOKEN_COOKIE_NAME is ${tokenName[1]}`);
    } else if (prefs.length !== 1 || !prefs[0].split(',').includes(`${call[2]}@${call[1]}`)) {
      fail('pref', SIDECAR_REL, 'COOKIE NOT HIDDEN', `${SIDECAR_REL} must set pref("${prefName}") once, listing ${call[2]}@${call[1]}; found ${JSON.stringify(prefs)}: browser.cookies would hand extensions the token`);
    } else {
      out.passes.push(`pref PASS -- ${SIDECAR_REL} hides ${call[2]}@${call[1]}, the cookie TheiaService sets`);
    }
  }

  // origins: the shell writes the hidden-origins pref to the sidecar origin and Theia's webview origin pattern.
  if (originsPref) {
    const api = inp.shell.get(API_REL) || '';
    const theiaSrc = inp.shell.get(THEIA_REL) || '';
    const side = inp.shell.get(SIDECAR_REL) || '';
    const host = /"--hostname", "([^"]+)"/.exec(theiaSrc);
    const pattern = /WebviewExternalEndpoint\.defaultPattern = '([^']+)';/.exec(inp.webviewProtocol || '');
    const writes = [...api.matchAll(new RegExp(`getDefaultBranch\\(""\\)\\.setStringPref\\("${originsPref.replace(/\./g, '\\.')}", ([A-Za-z_$][\\w$]*)\\.join\\(","\\)\\);`, 'g'))];
    if (!host || !pattern) {
      fail('origins', 'derivation', 'BROKEN', `could not derive the sidecar host (${THEIA_REL} --hostname: ${!!host}) or Theia's webview endpoint pattern (${WEBVIEW_PROTOCOL_REL}: ${!!pattern}); run yarn in theia/`);
    } else if (/THEIA_WEBVIEW_EXTERNAL_ENDPOINT/.test(theiaSrc)) {
      fail('origins', THEIA_REL, 'ENDPOINT OVERRIDE', `${THEIA_REL} sets THEIA_WEBVIEW_EXTERNAL_ENDPOINT, so Theia's default webview pattern no longer applies; derive the hidden origins from the override`);
    } else if (writes.length !== 1) {
      fail('origins', API_REL, 'ORIGINS NOT SET', `${API_REL} writes pref ${originsPref} on the default branch ${writes.length} time(s) (need exactly one): Theia's workers stay visible to extensions`);
    } else {
      const v = writes[0][1];
      const decl = new RegExp(`const ${v} = [^\\n]*\\[([^\\]]*)\\];`).exec(api);
      const got = decl ? [...decl[1].matchAll(/`([^`]*)`/g)].map(m => m[1].replace(/\$\{[^}]+\}/g, 'PORT')).sort() : [];
      const want = [`http://${host[1]}:PORT`, `http://${pattern[1].replace('{{uuid}}', '*').replace('{{hostname}}', `${host[1]}:PORT`)}`].sort();
      if (JSON.stringify(got) !== JSON.stringify(want)) {
        fail('origins', API_REL, 'ORIGINS MISMATCH', `${API_REL} hides ${JSON.stringify(got)}; the sidecar origin and Theia's webview pattern ${pattern[1]} give ${JSON.stringify(want)}`);
      } else if ((side.match(new RegExp(`^pref\\("${originsPref.replace(/\./g, '\\.')}", ""\\);$`, 'gm')) || []).length !== 1) {
        fail('origins', SIDECAR_REL, 'PREF UNDECLARED', `${SIDECAR_REL} must declare pref("${originsPref}", "") once (the live value is written at runtime)`);
      } else {
        out.passes.push(`origins PASS -- ${API_REL} writes ${originsPref} = ${want.join(',')} (port at runtime), derived from the sidecar host and Theia's webview pattern ${pattern[1]}`);
      }
    }
  }
  return out;
}

// ---- self-test -------------------------------------------------------------

function clone(inp) {
  return { patchText: inp.patchText, post: new Map(inp.post), consumers: new Set(inp.consumers), shell: new Map(inp.shell), webviewProtocol: inp.webviewProtocol };
}

function dropFileSection(patchText, path) {
  const parts = patchText.split(/(?=^diff --git )/m);
  return parts.filter(p => !p.startsWith(`diff --git a/${path} `)).join('');
}

function selfTest(base) {
  let bad = 0;
  const clean = check(base);
  if (clean.failures.length) {
    console.log(`${NAME} --self-test: FAIL -- the clean tree is not green: ${clean.failures.map(f => f.text).join('; ')}`);
    return 1;
  }
  const mutatePost = (file, find, replace) => inp => {
    const t = inp.post.get(file);
    if (!t.includes(find)) return false;
    inp.post.set(file, t.replace(find, replace));
    return true;
  };
  const mutateShell = (rel, find, replace) => inp => {
    const t = inp.shell.get(rel);
    if (!t || !t.includes(find)) return false;
    inp.shell.set(rel, t.replace(find, replace));
    return true;
  };
  const wrWall = inp => /if \(isHiddenChannel\(channel\)\) \{\n\s*return;\n\s*\}\n/.exec(inp.post.get(WEBREQUEST));
  const plants = [
    ['060 without its WebRequest section', inp => {
      const t = dropFileSection(inp.patchText, WEBREQUEST);
      if (t === inp.patchText) return false;
      inp.post = derivePost(t);
      return true;
    }, 'wall', 'HELPER'],
    ['060 without its ProxyChannelFilter section', inp => {
      const t = dropFileSection(inp.patchText, PROXY);
      if (t === inp.patchText) return false;
      inp.post = derivePost(t);
      return true;
    }, 'wall', 'HELPER'],
    ['060 without its ext-cookies section', inp => {
      const t = dropFileSection(inp.patchText, COOKIES);
      if (t === inp.patchText) return false;
      inp.post = derivePost(t);
      return true;
    }, 'cookies', 'HELPER'],
    ['runChannelListener wall removed', inp => {
      const m = wrWall(inp);
      if (!m) return false;
      inp.post.set(WEBREQUEST, inp.post.get(WEBREQUEST).replace(m[0], ''));
      return true;
    }, 'wall', 'UNWALLED MATCH', 'runChannelListener'],
    ['shouldHookListener wall removed', mutatePost(WEBREQUEST, 'if (isHiddenChannel(channel)) {\n      return false;\n    }\n', ''), 'wall', 'UNWALLED MATCH', 'shouldHookListener'],
    ['applyFilter wall removed', mutatePost(PROXY, 'if (isHiddenChannel(wrapper)) {\n        return;\n      }\n', ''), 'wall', 'UNWALLED MATCH', 'applyFilter'],
    ['runChannelListener wall closed before the match', inp => {
      const m = wrWall(inp);
      if (!m) return false;
      inp.post.set(WEBREQUEST, inp.post.get(WEBREQUEST).replace(m[0], `if (kind === "zzz") {\n      ${m[0].trim()}\n    }\n`));
      return true;
    }, 'wall', 'UNWALLED MATCH', 'runChannelListener'],
    ['a new unwalled matching method in WebRequest', mutatePost(WEBREQUEST, '  examine(channel) {', '  zzzPlanted(channel, opts) {\n    return channel.matches(opts.filter, opts.policy, null);\n  },\n\n  examine(channel) {'), 'wall', 'UNWALLED MATCH', 'zzzPlanted'],
    ['helper reads another attribute', mutatePost(PROXY, 'hasAttribute("extensionnetworkhidden")', 'hasAttribute("messagemanagergroup")'), 'wall', 'ATTRIBUTE MISMATCH'],
    ['an unaccounted ChannelWrapper consumer', inp => { inp.consumers.add('toolkit/components/extensions/zzzPlanted.sys.mjs'); return true; }, 'consumers', 'UNACCOUNTED CONSUMER', 'zzzPlanted'],
    ['a stale exempt entry', inp => inp.consumers.delete('toolkit/components/extensions/parent/ext-identity.js'), 'consumers', 'STALE ENTRY', 'ext-identity'],
    ['cookie query read unwalled', mutatePost(COOKIES, '!context.extension.allowedOrigins.matchesCookie(cookie) ||\n      isHiddenCookie(cookie.name, cookie.rawHost)', '!context.extension.allowedOrigins.matchesCookie(cookie)'), 'cookies', 'UNWALLED READ', 'matches'],
    ['cookie onChanged connective weakened', mutatePost(COOKIES, '!isHiddenCookie(cookie.name, cookie.rawHost)\n', 'isHiddenCookie(cookie.name, cookie.rawHost)\n'), 'cookies', 'UNWALLED READ', 'onChanged'],
    ['cookie set refusal removed', mutatePost(COOKIES, 'isHiddenCookie(name, (details.domain ?? uri.host).replace(/^\\./, "")) ||\n', ''), 'cookies', 'UNWALLED WRITE'],
    ['the Theia frame unmarked', mutateShell(XHTML_REL, ' extensionnetworkhidden="true"', ''), 'frame', 'FRAME UNMARKED', 'powerbrowser-content'],
    ['an overlay marked from the JS', inp => {
      const t = inp.shell.get(API_REL);
      inp.shell.set(API_REL, `${t}\noverlay.setAttribute("extensionnetworkhidden", "true");\n`);
      return true;
    }, 'frame', 'WRITE SITE', 'PowerBrowserAPI.sys.mjs'],
    ['the sidecar pref dropped', mutateShell(SIDECAR_REL, 'pref("extensions.cookies.hidden", ', 'pref("zzz.planted", '), 'pref', 'COOKIE NOT HIDDEN'],
    ['the WebRequest worker branch removed', mutatePost(WEBREQUEST, 'return isHiddenOrigin(\n    loadInfo?.loadingPrincipal ?? loadInfo?.triggeringPrincipal\n  );', 'return false;'), 'wall', 'WORKER BRANCH', 'WebRequest'],
    ['the proxy worker branch removed', mutatePost(PROXY, 'return isHiddenOrigin(\n    loadInfo?.loadingPrincipal ?? loadInfo?.triggeringPrincipal\n  );', 'return false;'), 'wall', 'WORKER BRANCH', 'ProxyChannelFilter'],
    ['the hidden-origins pref unset by the shell', mutateShell(API_REL, 'Services.prefs.getDefaultBranch("").setStringPref("extensions.webRequest.hiddenOrigins", hidden.join(","));', ''), 'origins', 'ORIGINS NOT SET'],
    ['the webview pattern dropped from the hidden origins', mutateShell(API_REL, ', `http://*.webview.127.0.0.1:${groupSenderPort}`]', ']'), 'origins', 'ORIGINS MISMATCH'],
    ['Theia\'s webview pattern changed upstream', inp => {
      const t = inp.webviewProtocol.replace("defaultPattern = '{{uuid}}.webview.{{hostname}}'", "defaultPattern = 'webview-{{uuid}}.{{hostname}}'");
      if (t === inp.webviewProtocol) return false;
      inp.webviewProtocol = t;
      return true;
    }, 'origins', 'ORIGINS MISMATCH'],
    ['a webview endpoint override in TheiaService', mutateShell(THEIA_REL, '      THEIA_CONFIG_DIR: this._configDir,', '      THEIA_CONFIG_DIR: this._configDir,\n      THEIA_WEBVIEW_EXTERNAL_ENDPOINT: "{{uuid}}.wv.{{hostname}}",'), 'origins', 'ENDPOINT OVERRIDE'],
    ['the token cookie renamed in the API', mutateShell(API_REL, 'const TOKEN_COOKIE_NAME = "POWERBROWSER_TOKEN";', 'const TOKEN_COOKIE_NAME = "POWERBROWSER_TOKEN2";'), 'pref', 'NAME MISMATCH'],
  ];
  for (const [label, plant, family, kind, needle] of plants) {
    const inp = clone(base);
    if (!plant(inp)) {
      bad++;
      console.log(`${NAME} --self-test: FAIL -- plant '${label}' did not land`);
      continue;
    }
    const res = check(inp);
    const hit = res.failures.find(f => f.family === family && f.kind === kind && (!needle || f.text.includes(needle) || f.id.includes(needle)));
    if (hit) {
      console.log(`  ok  ${label} -> red ${family}/${kind}: ${hit.text}`);
    } else {
      bad++;
      console.log(`${NAME} --self-test: FAIL -- plant '${label}' did not go red as ${family}/${kind}${needle ? ` naming ${needle}` : ''}; got: ${res.failures.map(f => `${f.family}/${f.kind}`).join(', ') || 'green'}`);
    }
  }
  console.log(bad
    ? `${NAME} --self-test: FAIL -- ${bad} of ${plants.length} plant(s)`
    : `${NAME} --self-test: PASS -- the clean tree is green and all ${plants.length} plants went red naming their drift`);
  return bad ? 1 : 0;
}

// ---- main ------------------------------------------------------------------

function main() {
  let inp;
  try {
    inp = loadInputs();
  } catch (e) {
    console.log(`${NAME}: FAIL -- BROKEN INSTRUMENT: ${String(e.message || e).split('\n')[0]}. Next step: bash scripts/fetch-upstream.sh, and check patches/060-extension-network-wall.patch applies to upstream HEAD`);
    process.exit(1);
  }
  if (process.argv.includes('--self-test')) process.exit(selfTest(inp));
  const res = check(inp);
  for (const p of res.passes) console.log(`  ${p}`);
  for (const f of res.failures) console.log(`  FAIL ${f.family} ${f.kind} -- ${f.text}`);
  console.log(res.failures.length ? `${NAME}: FAIL -- ${res.failures.length} failure(s)` : `${NAME}: PASS -- every network observer, the cookie API and the frame marker carry the Theia wall`);
  process.exit(res.failures.length ? 1 : 0);
}

main();
