// Spike 002c content script: proves injection by two independent channels
// (a direct POST, and runtime messaging whose `sender` the background records).
/* global ORIGIN */
(() => {
  const href = location.href;
  fetch(`${ORIGIN}/log`, { method: 'POST', body: JSON.stringify({ src: 'cs', kind: 'cs-injected', t: Date.now(), data: { href, top: window === window.top } }) }).catch(() => {});
  browser.runtime.sendMessage({ kind: 'cs-hello', href }).then(
    reply => fetch(`${ORIGIN}/log`, { method: 'POST', body: JSON.stringify({ src: 'cs', kind: 'cs-reply', t: Date.now(), data: { href, reply } }) }),
    err => fetch(`${ORIGIN}/log`, { method: 'POST', body: JSON.stringify({ src: 'cs', kind: 'cs-send-error', t: Date.now(), data: { href, err: String(err) } }) }),
  );
  const port = browser.runtime.connect({ name: href });
  port.onMessage.addListener(m => port.postMessage({ pong: m.ping, href }));
  browser.runtime.onMessage.addListener(m => Promise.resolve({ fromContent: href, m }));
})();
