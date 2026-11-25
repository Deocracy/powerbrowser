/**
 * NG-025/NG-026 (non-GUI wave B): the documented, token-gated tab-store
 * endpoint for users and MCP clients. docs/tab-store-access.md is the
 * user-facing contract.
 *
 * It is its OWN loopback listener, not a route on the Theia backend's port:
 * that port's cookie gate (token-gate) admits the per-launch cookie, which
 * never leaves the supervisor, and widening that gate would widen Theia's
 * arbitrary-execution surface with it. Nothing here comes from the retired
 * backend-opencode /mcp route (decisions.md D2).
 *
 * Three walls run before any tool, in this order:
 *   1. a request carrying an Origin header comes from a browser page -> 403.
 *      Every browser POST carries Origin and MCP clients send none, so this
 *      is what stops a hostile 127.0.0.1 page even when it holds the token;
 *   2. the Host header must name this listener (DNS rebinding) -> 403;
 *   3. the per-launch bearer token from the 0600 access file -> 401.
 * The access file carries the URL and the token and is rewritten on every
 * backend start, so a respawned backend's clients re-read it.
 */
import * as crypto from 'crypto';
import * as http from 'http';
import { chmodSync, renameSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { inject, injectable } from '@theia/core/shared/inversify';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { POWERBROWSER_ENV } from '@powerbrowser/token-gate/lib/node/powerbrowser-env';
import { TAB_QUERY_FILE_NAME } from './tab-query-service';
import { STORE_ACCESS_FILE_NAME, STORE_ACCESS_ROUTE, StoreMessage, TAB_STORE_WRITE_FIELDS, TAB_STORE_WRITE_OPS, TabStoreToolName } from '../browser/tab-store-access-protocol';
import { runReadOnlySql } from './tab-store-sql';
import { TabStoreRelayHub } from './tab-store-relay';

const MCP_VERSION = '2025-06-18';
const MAX_BODY_BYTES = 1024 * 1024;

type Args = Record<string, unknown>;

interface ToolDef {
    name: TabStoreToolName;
    description: string;
    inputSchema: object;
}

const TOOLS: ToolDef[] = [
    {
        name: 'tabs_sql',
        description: 'Run one read-only SELECT (or WITH ... SELECT) against tabs.sqlite. Returns columns, rows (at most 1000) and truncated.',
        inputSchema: {
            type: 'object',
            properties: {
                sql: { type: 'string', description: 'One read-only statement. ATTACH, DETACH, VACUUM, PRAGMA and load_extension are refused.' },
                params: { type: 'array', items: { type: ['string', 'number', 'null'] }, description: 'Values bound to ? placeholders.' },
            },
            required: ['sql'],
        },
    },
    {
        name: 'history_entry',
        description: 'Read one page from browsing history by exact URL. Returns entry: {url, title}, or null.',
        inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    },
    {
        name: 'bookmark_by_url',
        description: 'Read the bookmark for an exact URL. Returns bookmark: {guid, title, url}, or null.',
        inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    },
    {
        name: 'bookmark_folder',
        description: 'List a bookmark folder by its 12-character GUID. Returns rows of {guid, title, url}.',
        inputSchema: { type: 'object', properties: { guid: { type: 'string' } }, required: ['guid'] },
    },
    {
        name: 'sessionstore_tabs',
        description: 'List the open tabs as session restore records them. Returns rows of {uri, url, title, last_active}.',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'tabs_with_places',
        description: 'Tabs joined to history and bookmarks on URL, highest frecency first. Filters: bookmarked (true/false), open (true/false); limit 1-1000, default 200. Only the 5000 most recently active tab rows are scanned; truncated is true when older rows were not joined.',
        inputSchema: {
            type: 'object',
            properties: { bookmarked: { type: 'boolean' }, open: { type: 'boolean' }, limit: { type: 'integer', minimum: 1, maximum: 1000 } },
        },
    },
    {
        name: 'tab_store_write',
        description: 'Change tab and group data through PowerBrowser\'s own writer. op is one of the listed operations; the other arguments are that operation\'s fields (docs/tab-store-access.md).',
        inputSchema: {
            type: 'object',
            properties: {
                op: { type: 'string', enum: [...TAB_STORE_WRITE_OPS] },
                id: { type: 'string' },
                title: { type: 'string' },
                x: { type: 'number' },
                y: { type: 'number' },
                w: { type: 'number' },
                h: { type: 'number' },
                uri: { type: 'string' },
                groupId: { type: ['string', 'null'] },
                uris: { type: 'array', items: { type: 'string' } },
                key: { type: 'string', description: 'setSetting: a settings key from docs/TAB-STORE.md' },
                value: { type: 'string', description: 'setSetting: the new value, as text' },
            },
            required: ['op'],
        },
    },
];

function requireString(value: unknown, name: string): string {
    // Chrome's own cap (storeUrlArg), mirrored so an oversized argument never crosses the relay.
    if (typeof value !== 'string' || !value || value.length > 8192) {
        throw new Error(`${name} must be a non-empty string of at most 8192 characters`);
    }
    return value;
}

/** Chrome's folderGuid shape (handleStoreRequest), checked before the relay. */
function requireGuid(value: unknown): string {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{12}$/.test(value)) {
        throw new Error('guid must be a 12-character bookmark GUID');
    }
    return value;
}

class RpcFailure extends Error {
    constructor(readonly code: number, message: string) {
        super(message);
    }
}

function readBody(req: http.IncomingMessage, limit: number): Promise<string> {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > limit) {
                reject(new Error('request body too large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

@injectable()
export class TabStoreAccessEndpoint implements BackendApplicationContribution {
    protected readonly profileDir: string = POWERBROWSER_ENV['POWERBROWSER_PROFILE_DIR'] ?? '';
    protected server: http.Server | undefined;
    protected token = '';
    protected port = 0;
    protected accessFile = '';

    @inject(TabStoreRelayHub)
    protected readonly relay: TabStoreRelayHub;

    onStart(): void {
        if (!this.profileDir) {
            // A dev backend with no supervising browser has no profile to serve.
            console.warn('tab-store-access: no profile directory, so the store endpoint stays off');
            return;
        }
        this.token = crypto.randomBytes(32).toString('hex');
        const server = http.createServer((req, res) => {
            void this.handle(req, res);
        });
        server.listen(0, '127.0.0.1', () => this.announce(server));
        this.server = server;
    }

    onStop(): void {
        if (this.server) {
            this.server.close();
        }
        if (this.accessFile) {
            rmSync(this.accessFile, { force: true });
        }
    }

    protected announce(server: http.Server): void {
        const address = server.address();
        if (!address || typeof address === 'string') {
            server.close();
            return;
        }
        this.port = address.port;
        this.accessFile = join(this.profileDir, STORE_ACCESS_FILE_NAME);
        const staging = `${this.accessFile}.${process.pid}.tmp`;
        // A crashed backend may leave staging behind with broader bits, and
        // writeFileSync's mode applies only at creation -- so remove any
        // leftover and create exclusively at 0600, never landing the fresh
        // token in a file another user can read.
        rmSync(staging, { force: true });
        writeFileSync(staging, JSON.stringify({ url: `http://127.0.0.1:${this.port}${STORE_ACCESS_ROUTE}`, token: this.token }) + '\n', { mode: 0o600, flag: 'wx' });
        chmodSync(staging, 0o600); // the mode is masked by the umask; chmod is not
        renameSync(staging, this.accessFile);
    }

    protected async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        if (req.headers.origin !== undefined) {
            return this.status(res, 403);
        }
        const host = req.headers.host;
        if (host !== `127.0.0.1:${this.port}` && host !== `localhost:${this.port}`) {
            return this.status(res, 403);
        }
        if (!this.tokenMatches(req.headers.authorization)) {
            return this.status(res, 401);
        }
        if (req.url !== STORE_ACCESS_ROUTE) {
            return this.status(res, 404);
        }
        if (req.method !== 'POST') {
            return this.status(res, 405);
        }
        let body: string;
        try {
            body = await readBody(req, MAX_BODY_BYTES);
        } catch {
            return this.status(res, 413);
        }
        let msg: { id?: unknown; method?: unknown; params?: unknown };
        try {
            msg = JSON.parse(body);
        } catch {
            return this.json(res, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'invalid JSON' } });
        }
        if (!msg || typeof msg !== 'object') {
            return this.json(res, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'invalid request' } });
        }
        const id = msg.id === undefined ? null : msg.id;
        try {
            const result = await this.dispatch(String(msg.method ?? ''), (msg.params ?? {}) as Args);
            if (msg.id === undefined) {
                res.writeHead(202).end(); // a notification gets no body
                return;
            }
            this.json(res, { jsonrpc: '2.0', id, result });
        } catch (err) {
            const code = err instanceof RpcFailure ? err.code : -32603;
            this.json(res, { jsonrpc: '2.0', id, error: { code, message: err instanceof Error ? err.message : String(err) } });
        }
    }

    protected tokenMatches(header: string | undefined): boolean {
        const match = /^Bearer ([0-9a-f]{64})$/.exec(header ?? '');
        return !!match && !!this.token && crypto.timingSafeEqual(Buffer.from(match[1]), Buffer.from(this.token));
    }

    protected status(res: http.ServerResponse, code: number): void {
        res.writeHead(code).end();
    }

    protected json(res: http.ServerResponse, value: unknown): void {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(value));
    }

    protected async dispatch(method: string, params: Args): Promise<unknown> {
        switch (method) {
            case 'initialize':
                return {
                    protocolVersion: typeof params.protocolVersion === 'string' ? params.protocolVersion : MCP_VERSION,
                    capabilities: { tools: {} },
                    serverInfo: { name: 'powerbrowser-tab-store', version: '1.0.0' },
                };
            case 'notifications/initialized':
            case 'ping':
                return {};
            case 'tools/list':
                return { tools: TOOLS };
            case 'tools/call':
                return this.callTool(String(params.name ?? ''), (params.arguments ?? {}) as Args);
            default:
                throw new RpcFailure(-32601, `unknown method ${method}`);
        }
    }

    protected async callTool(name: string, args: Args): Promise<object> {
        try {
            const value = await this.runTool(name, args);
            return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value };
        } catch (err) {
            return { isError: true, content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }] };
        }
    }

    protected async runTool(name: string, args: Args): Promise<object> {
        switch (name) {
            case 'tabs_sql':
                return runReadOnlySql(join(this.profileDir, TAB_QUERY_FILE_NAME), args.sql, args.params);
            case 'history_entry':
                return { entry: await this.chrome({ kind: 'readHistoryEntry', url: requireString(args.url, 'url') }, 'entry') };
            case 'bookmark_by_url':
                return { bookmark: await this.chrome({ kind: 'readBookmarkByUrl', url: requireString(args.url, 'url') }, 'bookmark') };
            case 'bookmark_folder':
                return { rows: await this.chrome({ kind: 'listBookmarkFolder', folderGuid: requireGuid(args.guid) }, 'rows') };
            case 'sessionstore_tabs':
                return { rows: await this.chrome({ kind: 'projectSessionStoreTabs' }, 'rows') };
            case 'tabs_with_places': {
                const msg: StoreMessage = { kind: 'queryTabsWithPlaces' };
                for (const key of ['bookmarked', 'open']) {
                    if (typeof args[key] === 'boolean') {
                        msg[key] = args[key];
                    }
                }
                if (Number.isInteger(args.limit)) {
                    msg.limit = args.limit;
                }
                const reply = await this.chromeReply(msg);
                return { rows: reply['rows'] ?? null, truncated: reply['truncated'] === true };
            }
            case 'tab_store_write': {
                const op = typeof args.op === 'string' ? args.op : '';
                const fields = Object.prototype.hasOwnProperty.call(TAB_STORE_WRITE_FIELDS, op) ? TAB_STORE_WRITE_FIELDS[op] : undefined;
                if (!fields) {
                    throw new Error(`op must be one of ${TAB_STORE_WRITE_OPS.join(', ')}`);
                }
                const msg: StoreMessage = { kind: op };
                for (const field of fields) {
                    if (args[field] !== undefined) {
                        msg[field] = args[field];
                    }
                }
                return this.chromeReply(msg);
            }
            default:
                throw new Error(`unknown tool ${name}`);
        }
    }

    /** One chrome read through a connected window; the whole reply. */
    protected async chromeReply(msg: StoreMessage): Promise<Record<string, unknown>> {
        const reply = await this.relay.relay(msg);
        if (!reply.ok) {
            throw new Error(reply.message ?? `${msg.kind} failed (${reply.reason ?? 'store'})`);
        }
        return reply as Record<string, unknown>;
    }

    /** One chrome read through a connected window; the reply field, or null. */
    protected async chrome(msg: StoreMessage, field: string): Promise<unknown> {
        return (await this.chromeReply(msg))[field] ?? null;
    }
}
