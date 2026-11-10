// Loaded into the Theia sidecar with NODE_OPTIONS=--require by scripts/verify-sidecar-origin-gate-live.mjs only.
// For each HTTP request or WebSocket upgrade whose query carries probe=<tag>, appends one JSON line to
// $PB_SIDECAR_STATUS_LOG: the tag, the Origin and Sec-Fetch-Site headers, whether the token cookie arrived
// (a boolean, never its value), and the status the sidecar answered with. Check instrumentation, never a
// product file.
'use strict';
const fs = require('fs');
const http = require('http');
const LOG = process.env.PB_SIDECAR_STATUS_LOG;
if (LOG) {
    const tagOf = url => /[?&]probe=([\w-]+)/.exec(url || '')?.[1];
    const row = (kind, req, tag) => ({
        tag, kind, method: req.method, origin: req.headers.origin ?? null, sfs: req.headers['sec-fetch-site'] ?? null,
        pbCookie: String(req.headers.cookie || '').split(';').some(p => p.trim().startsWith('POWERBROWSER_TOKEN=')),
    });
    const write = obj => { try { fs.appendFileSync(LOG, JSON.stringify(obj) + '\n'); } catch { /* best effort */ } };
    const emit = http.Server.prototype.emit;
    http.Server.prototype.emit = function (event, req, resOrSocket) {
        const tag = (event === 'request' || event === 'upgrade') && tagOf(req.url);
        if (tag && event === 'request') {
            const r = row('http', req, tag);
            resOrSocket.once('finish', () => write({ ...r, status: resOrSocket.statusCode }));
        } else if (tag) {
            const r = row('ws', req, tag);
            const sock = resOrSocket;
            const origWrite = sock.write;
            let done = false;
            sock.write = function (chunk, ...rest) {
                if (!done) {
                    done = true;
                    const m = /^HTTP\/1\.1 (\d{3})/.exec(String(chunk).slice(0, 20));
                    write({ ...r, status: m ? Number(m[1]) : 'non-http' });
                }
                return origWrite.call(this, chunk, ...rest);
            };
            sock.once('close', () => { if (!done) { done = true; write({ ...r, status: 'closed' }); } });
        }
        return emit.apply(this, arguments);
    };
}
