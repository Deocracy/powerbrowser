import * as crypto from 'crypto';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import { injectable, inject } from '@theia/core/shared/inversify';
import * as express from '@theia/core/shared/express';
import { BackendApplicationContribution, EarlyExpressMiddleware } from '@theia/core/lib/node';
import { WsRequestValidatorContribution } from '@theia/core/lib/node/ws-request-validators';
import { ApplicationPackage } from '@theia/core/shared/@theia/application-package';
import { POWERBROWSER_ENV } from './powerbrowser-env';
import { isWebviewHost } from '../common/webview-host';

// D-98: replaces the trust root for backend access on plain HTTP -- the
// stock BrowserConnectionTokenBackendContribution (browser-connection-token.js)
// only rejects WebSocket upgrades and opt-in routes; it never rejects a plain
// GET of the index document or static assets, and it unconditionally issues
// its own cookie regardless of what this contribution decides. This gate
// sits ahead of it (see initialize() below) so a rejected request never
// reaches that stock middleware.
export const POWERBROWSER_TOKEN_COOKIE_NAME = 'POWERBROWSER_TOKEN';
const TOKEN_ENV_VAR = 'POWERBROWSER_TOKEN';
const TOKEN_DISABLE_ENV_VAR = 'POWERBROWSER_TOKEN_DISABLE';
// Plan 38-07: Theia's static webview shell (@theia/plugin-ext, copied to <app>/lib/webview/pre), by exact name.
const WEBVIEW_SHELL_FILES = new Set(['index.html', 'host.js', 'main.js', 'service-worker.js', 'fake.html']);

@injectable()
export class PowerBrowserTokenGateContribution implements BackendApplicationContribution, WsRequestValidatorContribution {

    @inject(EarlyExpressMiddleware)
    protected readonly earlyMiddleware: EarlyExpressMiddleware;

    @inject(ApplicationPackage)
    protected readonly applicationPackage: ApplicationPackage;

    protected token: string | undefined;
    protected disabled = false;
    protected port: number | undefined;

    initialize(): void {
        // POWERBROWSER_ENV, never process.env: powerbrowser-env.ts resolved the
        // whole handshake at module load -- the dev bypass captured from and
        // scrubbed out of process.env, and on a supervised launch the token
        // read off the stdin pipe, which is where the supervisor puts it so it
        // never appears in this process's /proc/<pid>/environ at all.
        const disable = POWERBROWSER_ENV[TOKEN_DISABLE_ENV_VAR] === '1';
        if (disable) {
            // Named legacy-dev bypass (scripts/smoke-theia.sh,
            // verify-platform.sh only). The supervised PowerBrowser path
            // never sets this -- it is a deliberately-typed name, not an
            // omission, so an unconfigured token never silently passes
            // through.
            this.disabled = true;
            process.stderr.write(
                `PowerBrowserTokenGateContribution: WARNING -- ${TOKEN_DISABLE_ENV_VAR}=1 is set. The token gate is DISABLED and this backend is reachable without a token.\n`
            );
            return;
        }

        const token = POWERBROWSER_ENV[TOKEN_ENV_VAR];
        if (!token) {
            // Fail-closed (D-98/SIDE-02): an unconfigured token is a startup
            // failure, never an inert/pass-through gate. On a supervised
            // launch this also covers a handshake that never arrived (the
            // parent died before writing the stdin line). This must run before
            // the HTTP server ever calls listen() -- initialize() is the
            // earliest BackendApplicationContribution hook, invoked from
            // BackendApplication#configure() which itself runs before
            // BackendApplication#start() binds the socket.
            process.stderr.write(
                `PowerBrowserTokenGateContribution: FATAL -- ${TOKEN_ENV_VAR} is not set. Refusing to start an ungated backend.\n`
            );
            process.exit(78);
            return;
        }

        this.token = token;
        // unshift, not push: the stock BrowserConnectionTokenBackendContribution
        // registers its own middleware via push() and unconditionally calls
        // next(), so if it ran first a rejected caller would still receive a
        // valid theia-connection-token cookie. Front-inserting guarantees this
        // handler runs first regardless of contribution registration order.
        this.earlyMiddleware.handlers.unshift((req, res, next) => this.gate(req, res, next));
    }

    configure(app: express.Application): void {
        // Gated for free: this route is registered in configure(), which
        // BackendApplication runs after applying earlyMiddleware.handlers, so
        // every request here has already passed (or been rejected by) gate().
        app.get('/powerbrowser/health', (_req, res) => {
            res.json({ ok: true, pid: process.pid, port: this.port ?? null });
        });
    }

    onStart(server: http.Server | https.Server): void {
        // The bound address is only readable once the socket binds, which
        // is asynchronous: contributions' onStart run as microtasks right
        // after listen() is initiated, so address() here is still null
        // whenever no earlier contribution yielded a macrotask first.
        // Announce now when already bound, else on 'listening' -- startup
        // must never depend on contribution ordering (16-03: the backend
        // exited 78 deterministically on every boot until this deferral).
        if (server.listening) {
            this.announce(server);
        } else {
            server.once('listening', () => this.announce(server));
        }
    }

    protected announce(server: http.Server | https.Server): void {
        const address = server.address();
        if (address === null || typeof address === 'string') {
            process.stderr.write(
                `PowerBrowserTokenGateContribution: FATAL -- could not determine the bound address (got ${JSON.stringify(address)}). Refusing to announce readiness.\n`
            );
            process.exit(78);
            return;
        }

        // SIDE-01: an accidental 0.0.0.0/:: bind must be a startup failure,
        // not a silently reachable backend -- never announce readiness for a
        // non-loopback bind.
        const isLoopback = (address.family === 'IPv4' && address.address === '127.0.0.1')
            || (address.family === 'IPv6' && address.address === '::1');
        if (!isLoopback) {
            process.stderr.write(
                `PowerBrowserTokenGateContribution: FATAL -- backend bound to non-loopback address ${address.address} (family ${address.family}). Refusing to announce readiness.\n`
            );
            process.exit(78);
            return;
        }

        this.port = address.port;
        // SIDE-01's port read-back channel: a stdout sentinel line, not a
        // file -- the supervisor already reads this stdout stream, it dies
        // with the process, and it needs no atomic-write/stale-file handling.
        // D-104: this contribution persists no state across process
        // lifetimes -- the expected token is read once per backend PROCESS
        // start (powerbrowser-env.ts, at module load) and every request is
        // validated against that in-memory value. The
        // respawn-accepts-the-same-cookie property comes from the supervisor
        // writing the same token onto each spawn's stdin pipe
        // (TheiaService._spawnAndGate), not from this process re-reading it
        // later -- and the token is never in this process's environment, so
        // neither a child nor a co-resident same-uid reader of
        // /proc/<pid>/environ can recover it.
        process.stdout.write(`POWERBROWSER_BACKEND_READY ${JSON.stringify({ port: this.port, pid: process.pid })}\n`);
    }

    protected gate(req: express.Request, res: express.Response, next: express.NextFunction): void {
        // Plan 38-07: a webview frame runs on its own origin, <uuid>.webview.localhost:<port>, which the
        // host-only 127.0.0.1 token cookie never reaches. Such a request is answered here and never passed on:
        // downstream sits Theia's connection-token bootstrap, which would Set-Cookie its own token on it.
        if (isWebviewHost(req.headers.host)) {
            this.serveWebviewShell(req, res);
            return;
        }
        const token = this.getTokenFromCookie(req);
        if (token !== undefined && this.isTokenValid(token)) {
            next();
            return;
        }
        // No next() on reject: stops the chain before the stock cookie
        // bootstrap (or any other downstream handler) ever runs for this
        // request. No header of any kind is set on this path.
        res.sendStatus(403);
    }

    /**
     * Plan 38-07: the only answer a webview origin gets. GET or HEAD of one of Theia's static webview shell files,
     * by exact name from a fixed root, or 403. Its resources arrive through the service worker and the main
     * frame's authenticated connection, never over HTTP here. Sets no cookie and calls no further handler.
     */
    protected serveWebviewShell(req: express.Request, res: express.Response): void {
        const name = req.path.startsWith('/webview/') ? req.path.slice('/webview/'.length) : '';
        if ((req.method !== 'GET' && req.method !== 'HEAD') || !WEBVIEW_SHELL_FILES.has(name)) {
            res.sendStatus(403);
            return;
        }
        const root = path.join(this.applicationPackage.projectPath, 'lib', 'webview', 'pre');
        res.sendFile(name, { root, dotfiles: 'deny' }, err => {
            if (err && !res.headersSent) {
                res.sendStatus(404);
            }
        });
    }

    /**
     * Plan 38-07: every WebSocket upgrade (Theia's RPC) needs the token cookie too. Socket.IO answers its own
     * path before express, so the gate above never sees these requests; Theia's own connection token alone
     * would otherwise guard them.
     */
    allowWsUpgrade(request: http.IncomingMessage): boolean {
        if (this.disabled) {
            return true;
        }
        const token = this.getTokenFromCookie(request);
        return token !== undefined && this.isTokenValid(token);
    }

    protected getTokenFromCookie(req: { headers: http.IncomingHttpHeaders }): string | undefined {
        const header = req.headers.cookie;
        if (!header) {
            return undefined;
        }
        for (const part of header.split(';')) {
            const eq = part.indexOf('=');
            if (eq === -1) {
                continue;
            }
            const name = part.slice(0, eq).trim();
            if (name === POWERBROWSER_TOKEN_COOKIE_NAME) {
                return part.slice(eq + 1).trim();
            }
        }
        return undefined;
    }

    protected isTokenValid(candidate: string): boolean {
        if (this.token === undefined) {
            return false;
        }
        const received = Buffer.from(candidate, 'utf8');
        const expected = Buffer.from(this.token, 'utf8');
        if (received.byteLength !== expected.byteLength) {
            return false;
        }
        return crypto.timingSafeEqual(received, expected);
    }
}
