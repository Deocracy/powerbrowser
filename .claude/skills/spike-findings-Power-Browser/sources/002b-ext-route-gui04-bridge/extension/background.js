// Spike 002b background (copied from spike 001; adds per-tab ops): reports everything the extension can see to the
// driver's local server (ORIGIN comes from config.js, written at install time).
/* global ORIGIN */
const post = (kind, data) => fetch(`${ORIGIN}/log`, {
  method: 'POST',
  body: JSON.stringify({ src: 'bg', kind, t: Date.now(), data }),
}).catch(() => {});

const tabLite = t => t && ({ id: t.id, windowId: t.windowId, index: t.index, active: t.active, url: t.url, title: t.title, status: t.status });
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
(browser.action || browser.browserAction).onClicked.addListener(async (tab, info) => {
  post('browserAction.onClicked', { tab: tabLite(tab), info });
  await snapshot('inside browserAction.onClicked');
});

const senderLite = s => ({ tab: tabLite(s.tab) ?? null, frameId: s.frameId, url: s.url, origin: s.origin, envType: s.envType, documentId: s.documentId });
browser.runtime.onMessage.addListener((msg, sender) => {
  post('runtime.onMessage', { msg, sender: senderLite(sender) });
  return Promise.resolve({ ack: true });
});

// Ports opened by content scripts: the only channel back into a page with no tabId.
const ports = new Map();
browser.runtime.onConnect.addListener(port => {
  const href = port.name;
  ports.set(href, port);
  post('runtime.onConnect', { name: port.name, sender: senderLite(port.sender) });
  port.onMessage.addListener(m => post('port.message', { name: port.name, m }));
  port.onDisconnect.addListener(() => { ports.delete(href); post('port.disconnect', { name: port.name }); });
});

const ops = {
  snapshot: ({ label }) => snapshot(label),
  pingPorts: () => { for (const p of ports.values()) p.postMessage({ ping: Date.now() }); return [...ports.keys()]; },
  executeScriptActive: async () => browser.tabs.executeScript
    ? browser.tabs.executeScript({ code: 'location.href' })
    : browser.scripting.executeScript({ target: { tabId: (await browser.tabs.query({ active: true, currentWindow: true }))[0].id }, func: () => location.href }).then(r => r.map(x => x.result)),
  sendMessageTab: ({ tabId }) => browser.tabs.sendMessage(tabId, { hi: 1 }),
  // What the page the extension reaches actually holds: its URL and its per-load nonce (the title).
  executeScriptTab: ({ tabId }) => browser.tabs.executeScript(tabId, { code: '[location.href, document.title]' }),
  activeTab: async () => (await browser.tabs.query({ active: true, currentWindow: true })).map(tabLite),
};

// Command channel: the driver queues ops on /cmd; results come back as cmd-result.
setInterval(async () => {
  let cmds;
  try { cmds = await (await fetch(`${ORIGIN}/cmd`)).json(); } catch { return; }
  for (const c of cmds) {
    const r = await attempt(() => ops[c.op](c.args || {}));
    post('cmd-result', { id: c.id, op: c.op, r });
  }
}, 150);

post('started', { manifest: browser.runtime.getManifest().manifest_version, id: browser.runtime.id });
