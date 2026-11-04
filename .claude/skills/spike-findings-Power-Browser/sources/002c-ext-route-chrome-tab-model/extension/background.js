// Spike 002c background: the spike 001 recorder plus write and id-addressed ops.
/* global ORIGIN */
const post = (kind, data) => fetch(`${ORIGIN}/log`, { method: 'POST', body: JSON.stringify({ src: 'bg', kind, t: Date.now(), data }) }).catch(() => {});
const tabLite = t => t && ({ id: t.id, windowId: t.windowId, index: t.index, active: t.active, url: t.url, title: t.title, status: t.status, favIconUrl: t.favIconUrl });
const winLite = w => w && ({ id: w.id, type: w.type, focused: w.focused, tabs: w.tabs ? w.tabs.map(tabLite) : undefined });
const attempt = async fn => { try { return { ok: await fn() }; } catch (e) { return { err: String(e) }; } };

async function snapshot(label) {
  const r = {
    label,
    queryAll: await attempt(async () => (await browser.tabs.query({})).map(tabLite)),
    queryActiveCurrent: await attempt(async () => (await browser.tabs.query({ active: true, currentWindow: true })).map(tabLite)),
    queryActiveLastFocused: await attempt(async () => (await browser.tabs.query({ active: true, lastFocusedWindow: true })).map(tabLite)),
    windowsGetAll: await attempt(async () => (await browser.windows.getAll({ populate: true })).map(winLite)),
    windowsGetCurrent: await attempt(async () => winLite(await browser.windows.getCurrent())),
    windowsGetLastFocused: await attempt(async () => winLite(await browser.windows.getLastFocused())),
  };
  post('snapshot', r);
  return r;
}

browser.tabs.onCreated.addListener(tab => post('tabs.onCreated', tabLite(tab)));
browser.tabs.onActivated.addListener(info => post('tabs.onActivated', info));
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => post('tabs.onUpdated', { tabId, changeInfo, tab: tabLite(tab) }));
browser.tabs.onRemoved.addListener((tabId, info) => post('tabs.onRemoved', { tabId, info }));
browser.windows.onCreated.addListener(w => post('windows.onCreated', winLite(w)));
browser.windows.onRemoved.addListener(id => post('windows.onRemoved', { id }));
browser.windows.onFocusChanged.addListener(id => post('windows.onFocusChanged', { id }));
browser.webNavigation.onCommitted.addListener(d => post('webNavigation.onCommitted', { tabId: d.tabId, frameId: d.frameId, url: d.url }));
browser.webRequest.onBeforeRequest.addListener(
  d => { if (!d.url.includes('/log') && !d.url.includes('/cmd')) post('webRequest.onBeforeRequest', { tabId: d.tabId, frameId: d.frameId, type: d.type, url: d.url }); },
  { urls: ['<all_urls>'], types: ['main_frame'] },
);
browser.browserAction.onClicked.addListener(async (tab, info) => {
  post('browserAction.onClicked', { tab: tabLite(tab), info });
  await snapshot('inside browserAction.onClicked');
});
browser.commands.onCommand.addListener(name => post('commands.onCommand', { name }));

const senderLite = s => ({ tab: tabLite(s.tab) ?? null, frameId: s.frameId, url: s.url });
browser.runtime.onMessage.addListener((msg, sender) => { post('runtime.onMessage', { msg, sender: senderLite(sender) }); return Promise.resolve({ ack: true }); });
const ports = new Map();
browser.runtime.onConnect.addListener(port => {
  ports.set(port.name, port);
  post('runtime.onConnect', { name: port.name, sender: senderLite(port.sender) });
  port.onDisconnect.addListener(() => { ports.delete(port.name); post('port.disconnect', { name: port.name }); });
});

const ops = {
  snapshot: ({ label }) => snapshot(label),
  queryNormal: async () => ({ tabs: (await browser.tabs.query({ windowType: 'normal' })).map(tabLite), windows: (await browser.windows.getAll({ windowTypes: ['normal'] })).map(w => w.id) }),
  executeScriptActive: () => browser.tabs.executeScript({ code: 'location.href' }),
  executeScriptTab: ({ tabId }) => browser.tabs.executeScript(tabId, { code: '[location.href, document.title]' }),
  sendMessageTab: ({ tabId }) => browser.tabs.sendMessage(tabId, { hi: 1 }),
  get: ({ tabId }) => browser.tabs.get(tabId).then(tabLite),
  update: ({ tabId, props }) => browser.tabs.update(tabId, props).then(tabLite),
  remove: ({ tabId }) => browser.tabs.remove(tabId),
  create: ({ props }) => browser.tabs.create(props).then(tabLite),
  setPopup: ({ popup }) => browser.browserAction.setPopup({ popup }),
  setBadgeText: ({ text, tabId }) => browser.browserAction.setBadgeText(tabId ? { text, tabId } : { text }),
  pageActionShow: ({ tabId }) => browser.pageAction.show(tabId),
};
setInterval(async () => {
  let cmds;
  try { cmds = await (await fetch(`${ORIGIN}/cmd`)).json(); } catch { return; }
  for (const c of cmds) post('cmd-result', { id: c.id, op: c.op, r: await attempt(() => ops[c.op](c.args || {})) });
}, 150);
post('started', { id: browser.runtime.id });
