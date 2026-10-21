// Spike 002a activeTab-only probe: no "tabs", no host permission. A toolbar
// click must grant it the page the user is looking at, and nothing else.
/* global ORIGIN */
const post = (kind, data) => fetch(`${ORIGIN}/log`, { method: 'POST', body: JSON.stringify({ src: 'at', kind, t: Date.now(), data }) }).catch(() => {});
browser.browserAction.onClicked.addListener(async tab => {
  let exec;
  try { exec = { ok: await browser.tabs.executeScript({ code: 'location.href' }) }; } catch (e) { exec = { err: String(e) }; }
  post('at.onClicked', { tabId: tab.id, windowId: tab.windowId, url: tab.url ?? null, exec });
});
post('at.started', {});
