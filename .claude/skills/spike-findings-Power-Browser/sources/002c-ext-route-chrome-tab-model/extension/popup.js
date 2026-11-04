/* global ORIGIN */
fetch(`${ORIGIN}/log`, { method: 'POST', body: JSON.stringify({ src: 'popup', kind: 'popup-loaded', t: Date.now(), data: { href: location.href } }) }).catch(() => {});
