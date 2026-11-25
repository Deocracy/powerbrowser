// Phase 67 research probe (P67-14): loaded into the Theia sidecar with NODE_OPTIONS=--require.
// Appends one JSON line per HTTP request and WebSocket upgrade to $PB67_HEADER_LOG:
// method, path (query kept only when it carries a probe= tag), Host, Origin, Sec-Fetch-*,
// whether the PowerBrowser and Theia token cookies were present (booleans, never values),
// and the response status. Research instrumentation only, never a product file.
'use strict';
const fs = require('fs');
const http = require('http');
const LOG = process.env.PB67_HEADER_LOG;
if (LOG) {
    const has = (cookie, name) => typeof cookie === 'string' && cookie.split(';').some(p => p.trim().startsWith(name + '='));
    const row = (kind, req) => {
        const url = req.url || '';
        const q = url.indexOf('?');
        const path = q === -1 ? url : (url.includes('probe=') ? url : url.slice(0, q));
        const h = req.headers;
        return {
            pid: process.pid, kind, method: req.method, path, host: h.host ?? null, origin: h.origin ?? null,
            sfs: h['sec-fetch-site'] ?? null, sfm: h['sec-fetch-mode'] ?? null, sfd: h['sec-fetch-dest'] ?? null,
            sfu: h['sec-fetch-user'] ?? null, pbCookie: has(h.cookie, 'POWERBROWSER_TOKEN'),
            theiaCookie: has(h.cookie, 'theia-connection-token'), ua: /Firefox|Gecko/.test(h['user-agent'] || '') ? 'gecko' : (h['user-agent'] ? 'other' : null),
        };
    };
    const write = obj => { try { fs.appendFileSync(LOG, JSON.stringify(obj) + '\n'); } catch { /* best effort */ } };
    const emit = http.Server.prototype.emit;
    http.Server.prototype.emit = function (event, req, resOrSocket) {
        if (event === 'request') {
            const r = row('http', req);
            resOrSocket.once('finish', () => write({ ...r, status: resOrSocket.statusCode }));
        } else if (event === 'upgrade') {
            const r = row('ws', req);
            const sock = resOrSocket;
            const origWrite = sock.write;
            let done = false;
            sock.write = function (chunk, ...rest) {
                if (!done) {
                    done = true;
                    const m = /^HTTP\/1\.1 (\d{3})/.exec(String(chunk).slice(0, 20));
                    write({ ...r, status: m ? Number(m[1]) : 'non-http-first-write' });
                }
                return origWrite.call(this, chunk, ...rest);
            };
            sock.once('close', () => { if (!done) { done = true; write({ ...r, status: 'closed-without-reply' }); } });
        }
        return emit.apply(this, arguments);
    };
}
