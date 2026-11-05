// scripts/lib/pb-extension-fixtures.mjs
//
// Phase 38 (EXT-06, EXT-07, EXT-08): the extensions verify-extension-actions-live.mjs
// installs: action and popup as temporary add-ons, content as an XPI that
// survives a restart. verify-extension-actions.mjs derives the
// fixture set (ids and versions) from these manifests at check time, so the
// live file and the static gate read one source and no id is kept by hand.
//
// Each background page posts records to the live harness's /log endpoint and
// polls /cmd for commands. __ORIGIN__ is replaced with the served origin.

const POST = `
const ORIGIN = __ORIGIN__;
const post = rec => { fetch(ORIGIN + '/log', { method: 'POST', body: JSON.stringify(rec) }).catch(() => {}); };
`;

// The action probe: no popup, activeTab only for page access. A click runs a script in the tab it was given and
// sets that tab's badge, so the page-side effect names the tab the click reached. It also drives tabs.create,
// tabs.remove and tabs.update({active}) on command.
const ACTION_BACKGROUND = `${POST}
post({ kind: 'started', id: browser.runtime.id });
browser.browserAction.onClicked.addListener(async tab => {
  let title = null;
  let err = null;
  try {
    title = (await browser.tabs.executeScript(tab.id, { code: "document.title = 'pb-ext-acted ' + location.pathname; document.title" }))[0];
  } catch (e) {
    err = String((e && e.message) || e);
  }
  await browser.browserAction.setBadgeText({ tabId: tab.id, text: 'ok' });
  post({ kind: 'clicked', tabId: tab.id, url: tab.url, title, err });
});
browser.tabs.onCreated.addListener(t => post({ kind: 'created', tabId: t.id, openerTabId: t.openerTabId, active: t.active }));
browser.tabs.onRemoved.addListener(id => post({ kind: 'removed', tabId: id }));
browser.tabs.onActivated.addListener(i => post({ kind: 'activated', tabId: i.tabId }));
async function run(cmd) {
  try {
    let result;
    if (cmd.op === 'create') {
      const t = await browser.tabs.create(cmd.props);
      result = { id: t.id, openerTabId: t.openerTabId, active: t.active };
    } else if (cmd.op === 'remove') {
      await browser.tabs.remove(cmd.tabId);
      result = true;
    } else if (cmd.op === 'create-activate') {
      const t = await browser.tabs.create({ ...cmd.props, active: false });
      const u = await browser.tabs.update(t.id, { active: true });
      result = { id: u.id, active: u.active };
    } else if (cmd.op === 'activate') {
      const t = await browser.tabs.update(cmd.tabId, { active: true });
      result = { id: t.id, active: t.active };
    } else if (cmd.op === 'query') {
      result = (await browser.tabs.query({})).map(t => ({ id: t.id, url: t.url, active: t.active, openerTabId: t.openerTabId }));
    } else {
      throw new Error('unknown op ' + cmd.op);
    }
    post({ kind: 'result', opId: cmd.opId, ok: true, result });
  } catch (e) {
    post({ kind: 'result', opId: cmd.opId, ok: false, error: String((e && e.message) || e) });
  }
}
setInterval(() => {
  fetch(ORIGIN + '/cmd').then(r => r.json()).then(cmds => cmds.forEach(run)).catch(() => {});
}, 250);
`;

// The popup probe: a click on it answers with a popup, so no click event reaches its background page.
const POPUP_BACKGROUND = `${POST}
post({ kind: 'popup-started', id: browser.runtime.id });
browser.browserAction.onClicked.addListener(tab => post({ kind: 'popup-clicked', tabId: tab.id }));
`;

// 38-03 (EXT-08): the content probe. Its content script marks each 127.0.0.1 page in its title, says hello (the
// background records sender.tab) and answers ping and act messages; its page action shows only on 127.0.0.1 pages,
// and a click on it retitles the page through that tab's content script. It records the tab id webRequest gives an
// overlay's image request. `forget-tabs` (the sender-tab-null plant) makes it record every later hello's tab as -1.
const CONTENT_BACKGROUND = `${POST}
post({ kind: 'content-started', id: browser.runtime.id });
// An event page with persisted listeners is only primed at app startup, not started (ext-backgroundPage.js); a
// runtime.onStartup listener is what starts it then, so the relaunch scenarios see it start with zero overlays.
browser.runtime.onStartup.addListener(() => {});
let forgetTabs = false;
browser.runtime.onMessage.addListener((msg, sender) => {
  if (msg.kind === 'hello') post({ kind: 'hello', path: msg.path, senderTabId: !forgetTabs && sender.tab ? sender.tab.id : -1 });
});
browser.webRequest.onBeforeRequest.addListener(d => post({ kind: 'request', url: d.url, tabId: d.tabId }), { urls: ['http://127.0.0.1/*'], types: ['image'] });
browser.pageAction.onClicked.addListener(async tab => {
  let title = null;
  let err = null;
  try {
    title = (await browser.tabs.sendMessage(tab.id, { kind: 'act' })).title;
  } catch (e) {
    err = String((e && e.message) || e);
  }
  post({ kind: 'page-clicked', tabId: tab.id, title, err });
});
async function run(cmd) {
  try {
    let result;
    if (cmd.op === 'ping') {
      result = await browser.tabs.sendMessage(cmd.tabId, { kind: 'ping' });
    } else if (cmd.op === 'isShown') {
      result = await browser.pageAction.isShown({ tabId: cmd.tabId });
    } else if (cmd.op === 'forget-tabs') {
      forgetTabs = true;
      result = true;
    } else {
      throw new Error('unknown op ' + cmd.op);
    }
    post({ kind: 'result', opId: cmd.opId, ok: true, result });
  } catch (e) {
    post({ kind: 'result', opId: cmd.opId, ok: false, error: String((e && e.message) || e) });
  }
}
setInterval(() => {
  fetch(ORIGIN + '/cmd').then(r => r.json()).then(cmds => cmds.forEach(run)).catch(() => {});
}, 250);
`;

const CONTENT_SCRIPT = `
document.title = 'pb-content ' + location.pathname;
browser.runtime.sendMessage({ kind: 'hello', path: location.pathname });
browser.runtime.onMessage.addListener(msg => {
  if (msg.kind === 'ping') return Promise.resolve({ path: location.pathname });
  if (msg.kind === 'act') {
    document.title = 'pb-page-acted ' + location.pathname;
    return Promise.resolve({ title: document.title });
  }
  return undefined;
});
`;

// 38-04 (B5): the sidebar, tab-page and commands probe. It has no toolbar action, so its puzzle row is read from its
// sidebar action. Its background answers the harness's commands on /cmd; it is the only fixture in a B5 session.
const SURFACES_BACKGROUND = `${POST}
post({ kind: 'surfaces-started', id: browser.runtime.id });
// The commands probe: the custom command retitles the tab it was given, so the page-side effect names that tab.
browser.commands.onCommand.addListener(async (name, tab) => {
  let title = null;
  let err = null;
  try {
    title = (await browser.tabs.executeScript(tab.id, { code: "document.title = 'pb-command ' + location.pathname; document.title" }))[0];
  } catch (e) {
    err = String((e && e.message) || e);
  }
  post({ kind: 'command', name, tabId: tab ? tab.id : null, url: tab ? tab.url : null, title, err });
});
async function run(cmd) {
  try {
    let result;
    if (cmd.op === 'url') {
      result = browser.runtime.getURL(cmd.path);
    } else if (cmd.op === 'options') {
      await browser.runtime.openOptionsPage();
      result = true;
    } else if (cmd.op === 'dashboard') {
      const t = await browser.tabs.create({ url: 'dashboard.html' });
      result = { id: t.id, windowId: t.windowId };
    } else if (cmd.op === 'overlay-nav') {
      const [t] = await browser.tabs.query({ url: cmd.url });
      await browser.tabs.update(t.id, { url: browser.runtime.getURL('dashboard.html') });
      result = true;
    } else {
      throw new Error('unknown op ' + cmd.op);
    }
    post({ kind: 'result', opId: cmd.opId, ok: true, result });
  } catch (e) {
    post({ kind: 'result', opId: cmd.opId, ok: false, error: String((e && e.message) || e) });
  }
}
setInterval(() => {
  fetch(ORIGIN + '/cmd').then(r => r.json()).then(cmds => cmds.forEach(run)).catch(() => {});
}, 250);
`;

const ACTION_ID = 'pb-ext-action-probe@powerbrowser.test';
const POPUP_ID = 'pb-ext-popup-probe@powerbrowser.test';
const CONTENT_ID = 'pb-ext-content-probe@powerbrowser.test';
const SURFACES_ID = 'pb-ext-surfaces-probe@powerbrowser.test';

export const EXTENSION_FIXTURES = Object.freeze({
  action: {
    manifest: {
      manifest_version: 2,
      name: 'PB action probe',
      version: '1.0',
      browser_specific_settings: { gecko: { id: ACTION_ID } },
      permissions: ['activeTab', 'tabs'],
      background: { scripts: ['background.js'] },
      browser_action: { default_title: 'PB action probe' },
    },
    files: { 'background.js': ACTION_BACKGROUND },
  },
  popup: {
    manifest: {
      manifest_version: 2,
      name: 'PB popup probe',
      version: '1.0',
      browser_specific_settings: { gecko: { id: POPUP_ID } },
      permissions: ['activeTab'],
      background: { scripts: ['background.js'] },
      browser_action: { default_title: 'PB popup probe', default_popup: 'popup.html' },
    },
    files: {
      'background.js': POPUP_BACKGROUND,
      'popup.html': '<!doctype html><title>pb-ext-popup</title><body>popup</body>',
    },
  },
  content: {
    manifest: {
      manifest_version: 3,
      name: 'PB content probe',
      version: '1.0',
      browser_specific_settings: { gecko: { id: CONTENT_ID } },
      permissions: ['webRequest'],
      host_permissions: ['http://127.0.0.1/*'],
      background: { scripts: ['background.js'] },
      content_scripts: [{ matches: ['http://127.0.0.1/*'], js: ['content.js'] }],
      page_action: { default_title: 'PB page action probe', show_matches: ['http://127.0.0.1/*'] },
    },
    files: { 'background.js': CONTENT_BACKGROUND, 'content.js': CONTENT_SCRIPT },
  },
  surfaces: {
    manifest: {
      manifest_version: 2,
      name: 'PB sidebar probe',
      version: '1.0',
      browser_specific_settings: { gecko: { id: SURFACES_ID } },
      permissions: ['tabs', 'activeTab'],
      background: { scripts: ['background.js'] },
      sidebar_action: { default_panel: 'panel.html', default_title: 'PB sidebar probe' },
      options_ui: { page: 'options.html', open_in_tab: true },
      commands: {
        'pb-probe': { suggested_key: { default: 'Alt+Shift+U' }, description: 'PB probe command' },
        _execute_sidebar_action: { suggested_key: { default: 'Alt+Shift+I' } },
      },
    },
    files: {
      'background.js': SURFACES_BACKGROUND,
      'panel.html': '<!doctype html><title>pb-sidebar-panel</title><body>sidebar</body>',
      'options.html': '<!doctype html><title>pb-options</title><body>options</body>',
      'dashboard.html': '<!doctype html><title>pb-dashboard</title><body>dashboard</body>',
    },
  },
});

/** The id a fixture installs under, read from its own manifest. */
export const fixtureId = name => EXTENSION_FIXTURES[name].manifest.browser_specific_settings.gecko.id;
