// Spike 002a furniture probe: the per-window chrome features (browserAction,
// pageAction, sidebarAction, menus, sessions, zoom) once the shell counts as a
// browser window. Installed AFTER the patch emulation, with a stock window open.
/* global ORIGIN */
const post = (kind, data) => fetch(`${ORIGIN}/log`, { method: 'POST', body: JSON.stringify({ src: 'fu', kind, t: Date.now(), data }) }).catch(() => {});
const attempt = async fn => { try { return { ok: await fn() }; } catch (e) { return { err: String(e) }; } };
const ops = {
  setBadgeGlobal: ({ text }) => browser.browserAction.setBadgeText({ text }),
  menusCreate: () => new Promise((res, rej) => browser.menus.create({ id: 'spike002a', title: 'spike002a item', contexts: ['page'] }, () => browser.runtime.lastError ? rej(browser.runtime.lastError.message) : res('created'))),
  recentlyClosed: () => browser.sessions.getRecentlyClosed().then(r => r.length),
  pageActionShow: ({ tabId }) => browser.pageAction.show(tabId).then(() => browser.pageAction.isShown({ tabId })),
  getZoom: ({ tabId }) => browser.tabs.getZoom(tabId),
  sidebarIsOpen: () => browser.sidebarAction.isOpen({}),
  zoomListen: () => { browser.tabs.onZoomChange.addListener(z => post('tabs.onZoomChange', z)); return 'added'; },
};
setInterval(async () => {
  let cmds;
  try { cmds = await (await fetch(`${ORIGIN}/fucmd`)).json(); } catch { return; }
  for (const c of cmds) post('fu-result', { id: c.id, op: c.op, r: await attempt(() => ops[c.op](c.args || {})) });
}, 150);
post('fu.started', {});
