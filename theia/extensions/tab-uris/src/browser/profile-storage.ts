import { inject, injectable } from '@theia/core/shared/inversify';
import { Emitter, Event as TheiaEvent, WaitUntilEvent } from '@theia/core/lib/common';
import { FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { ShellLayoutRestorer } from '@theia/core/lib/browser/shell/shell-layout-restorer';
import { LocalStorageService } from '@theia/core/lib/browser/storage-service';
import { WebTabChannel } from './web-tab';

/**
 * NG-033: Theia's storage, kept in the browser profile instead of the frontend
 * origin's localStorage.
 *
 * The sidecar's first spawn asks for port 0 (TheiaService.sys.mjs:602), so the
 * frontend origin -- and localStorage with it -- changes on nearly every
 * launch: the active mode, the per-mode layouts and the shell layout (stock
 * ShellLayoutRestorer's 'perspective-layouts') were lost on relaunch. This
 * service keeps one JSON map per profile, which chrome writes to
 * <profile>/powerbrowser-shell-state.json over the PowerBrowserGroup actor
 * (PowerBrowserAPI.handleShellMessage). The actor, not the backend: a
 * user-storage read awaited inside layout restore deadlocks against the RPC
 * connection (customize-css-contribution.ts header).
 *
 * It stands in for LocalStorageService, the store @theia/workspace's
 * WorkspaceStorageService writes through, so every key keeps its workspace
 * prefix (ruling F8): workspace-scoped state stays per workspace and only its
 * backing store moves.
 *
 * With no shell chrome behind the page -- the dev app on localhost:3000, or a
 * sender the actor refuses -- the first request settles as no-chrome or is
 * refused, and the service stays on localStorage (the base class) for the
 * rest of the session.
 */
export const SHELL_STATE_REQUEST_EVENT = 'PowerBrowserGroupRequest';
export const SHELL_STATE_RESPONSE_EVENT = 'PowerBrowserGroupResponse';
export const SHELL_STATE_ACK_TIMEOUT_MS = 5000;
export const SHELL_STATE_SAVE_DELAY_MS = 500;
/**
 * Final-review M1: the frontend's share of the quit budget. Chrome waits
 * `powerbrowser.shell.quitFlushTimeoutMs` (default 3000) for the ack, and the
 * history-file write plus the ack trip still have to fit after the listeners
 * return -- so the listeners get 2000, two thirds of chrome's bound, with the
 * 1000 ms margin left for storeLayout, save()'s round trip and the ack.
 */
export const SHELL_STATE_WILL_FLUSH_TIMEOUT_MS = 2000;
/** The push chrome sends to ask for a flush before a quit (PowerBrowserAPI.flushShellState). */
export const SHELL_FLUSH_KIND = 'flushShellState';
/** The only host the actor child loads on: its `matches` pin, GROUP_ACTOR_THEIA_ORIGIN in PowerBrowserAPI.sys.mjs. */
export const SHELL_FRAME_HOST = '127.0.0.1';

interface ShellStateReply {
    ok: boolean;
    state?: string;
    reason?: string;
    message?: string;
}

type ShellStateMessage =
    | { kind: 'shellStateLoad' }
    | { kind: 'shellStateSave'; state: string }
    | { kind: 'shellFlushed'; flushId: string }
    | { kind: 'shellArmWebTabHistory'; key: string };

const NO_CHROME = 'no-chrome';
type ShellStateOutcome = ShellStateReply | typeof NO_CHROME;

@injectable()
export class ProfileStorageService extends LocalStorageService {

    protected readonly onWillFlushEmitter = new Emitter<WaitUntilEvent>();
    /** Fired at the start of a quit flush; listeners add their last writes with waitUntil. */
    readonly onWillFlush: TheiaEvent<WaitUntilEvent> = this.onWillFlushEmitter.event;

    protected map: Promise<Record<string, unknown> | undefined> | undefined;
    protected loadedMap: Record<string, unknown> | undefined;
    protected saveTimer: number | undefined;
    protected seq = 0;

    async setData<T>(key: string, data?: T): Promise<void> {
        // Final-review I2: once the map is loaded the write lands in it
        // synchronously. `await this.load()` alone defers it by a microtask,
        // which the unload handler never gives: storeLayout's writes landed
        // after onStop's saveSyncNow had serialized the map, so a reload lost
        // the layout.
        const map = this.loadedMap ?? await this.load();
        if (!map) {
            return super.setData(key, data);
        }
        if (data === undefined) {
            delete map[key];
        } else {
            map[key] = data;
        }
        this.scheduleSave();
    }

    async getData<T>(key: string, defaultValue?: T): Promise<T | undefined> {
        const map = await this.load();
        if (!map) {
            return super.getData(key, defaultValue);
        }
        return Object.prototype.hasOwnProperty.call(map, key) ? map[key] as T : defaultValue;
    }

    /** Runs the onWillFlush listeners (bounded: SHELL_STATE_WILL_FLUSH_TIMEOUT_MS), so their writes are in the map before save(). */
    async fireWillFlush(): Promise<void> {
        await WaitUntilEvent.fire(this.onWillFlushEmitter, {}, SHELL_STATE_WILL_FLUSH_TIMEOUT_MS);
    }

    /**
     * Final-review I2: the synchronous unload write. Called from
     * ShellStateFlushContribution.onStop, which Theia core runs inside the
     * unload handler, after storeLayout. The request reaches chrome through
     * the actor child's DOM listener and its sendQuery, which dispatch
     * synchronously -- no promise, no timer -- so the save message leaves
     * before the document goes away. Returns nothing: there is no later tick
     * left in which an ack could arrive, and the actor child's synchronous
     * throw path (sendQuery failing with the message manager gone) already
     * nacks through the normal reply channel where it can still be heard.
     * Skips when the map never loaded (no-chrome sessions) or is empty.
     */
    saveSyncNow(): void {
        const map = this.loadedMap;
        if (!map || Object.keys(map).length === 0) {
            return;
        }
        if (location.protocol !== 'http:' || location.hostname !== SHELL_FRAME_HOST) {
            return;
        }
        if (this.saveTimer !== undefined) {
            window.clearTimeout(this.saveTimer);
            this.saveTimer = undefined;
        }
        const requestId = `shell-state-sync-${Date.now().toString(36)}-${(this.seq += 1)}`;
        try {
            // Same channel as request(): `bubbles` and the document target
            // reach the actor's listener on the window root. Fire-and-forget:
            // reading the reply would need an async listener that unload
            // never lets run.
            document.dispatchEvent(new CustomEvent(SHELL_STATE_REQUEST_EVENT, {
                bubbles: true,
                detail: { requestId, msg: { kind: 'shellStateSave', state: JSON.stringify(map) } },
            }));
        } catch {
            // The document is going away; there is nothing useful to report.
        }
    }

    /**
     * Sends the whole map to chrome now; true on chrome's ack. A setData made
     * just before this call is in the map: both await the same resolved load,
     * and microtasks run in order.
     */
    async save(): Promise<boolean> {
        if (this.saveTimer !== undefined) {
            window.clearTimeout(this.saveTimer);
            this.saveTimer = undefined;
        }
        const map = await this.load();
        if (!map) {
            return false;
        }
        const reply = await this.request({ kind: 'shellStateSave', state: JSON.stringify(map) });
        if (reply === NO_CHROME || !reply.ok) {
            console.error('[@powerbrowser/tab-uris] shell state save failed:', reply === NO_CHROME ? NO_CHROME : reply.message ?? reply.reason);
            return false;
        }
        return true;
    }

    /** Tells chrome the flush it asked for is done (PowerBrowserAPI.flushShellState waits on it). */
    async acknowledgeFlush(flushId: string): Promise<void> {
        await this.request({ kind: 'shellFlushed', flushId });
    }

    /** NG-034: asks chrome to restore `rowKey`'s saved back/forward history on that tab's next open. */
    async armWebTabHistory(rowKey: string): Promise<boolean> {
        const reply = await this.request({ kind: 'shellArmWebTabHistory', key: rowKey });
        return reply !== NO_CHROME && reply.ok;
    }

    protected load(): Promise<Record<string, unknown> | undefined> {
        if (!this.map) {
            this.map = this.request({ kind: 'shellStateLoad' }).then(reply => {
                if (reply === NO_CHROME || !reply.ok) {
                    return undefined;
                }
                let parsed: Record<string, unknown>;
                try {
                    const value: unknown = JSON.parse(typeof reply.state === 'string' && reply.state ? reply.state : '{}');
                    parsed = typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
                } catch {
                    parsed = {};
                }
                // Final-review I2: the resolved map, kept for the synchronous
                // unload write. The in-memory map is the write authority from
                // here on: setData mutates this same object after the first
                // load, so saveSyncNow always serializes the latest state.
                this.loadedMap = parsed;
                return parsed;
            });
        }
        return this.map;
    }

    protected scheduleSave(): void {
        if (this.saveTimer !== undefined) {
            return;
        }
        this.saveTimer = window.setTimeout(() => {
            this.saveTimer = undefined;
            void this.save();
        }, SHELL_STATE_SAVE_DELAY_MS);
    }

    /**
     * One request to chrome, settled by chrome's reply or the ack timeout --
     * never by the dispatch's return value. The actor child's preventDefault
     * is chrome's, and content never sees a cancel made by chrome
     * (Event::DefaultPrevented(CallerType), upstream/dom/events/Event.cpp:812),
     * so dispatchEvent returns true even when chrome has the request, as
     * web-tab.ts and browser-window-command.ts measured. Off the actor's host
     * no chrome can answer, so the request settles at once.
     */
    protected request(msg: ShellStateMessage): Promise<ShellStateOutcome> {
        if (location.protocol !== 'http:' || location.hostname !== SHELL_FRAME_HOST) {
            return Promise.resolve(NO_CHROME);
        }
        return new Promise<ShellStateOutcome>(resolve => {
            const requestId = `shell-state-${msg.kind}-${Date.now().toString(36)}-${(this.seq += 1)}`;
            const settle = (reply: ShellStateOutcome): void => {
                window.removeEventListener(SHELL_STATE_RESPONSE_EVENT, onResponse);
                window.clearTimeout(timer);
                resolve(reply);
            };
            const onResponse = (event: Event): void => {
                const detail = (event as CustomEvent).detail as { requestId?: unknown; reply?: unknown } | undefined;
                if (!detail || detail.requestId !== requestId) {
                    return;
                }
                settle(detail.reply && typeof detail.reply === 'object'
                    ? detail.reply as ShellStateReply
                    : { ok: false, reason: 'validation', message: 'malformed reply' });
            };
            const timer = window.setTimeout(() => settle({ ok: false, reason: 'timeout' }), SHELL_STATE_ACK_TIMEOUT_MS);
            window.addEventListener(SHELL_STATE_RESPONSE_EVENT, onResponse);
            try {
                // `bubbles` and the document target reach the actor's listener
                // on the window root (browser-window-command.ts requestStockTab).
                document.dispatchEvent(new CustomEvent(SHELL_STATE_REQUEST_EVENT, { bubbles: true, detail: { requestId, msg } }));
            } catch {
                settle(NO_CHROME);
            }
        });
    }
}

/**
 * NG-032/NG-033: answers chrome's quit flush. Chrome runs the flush on the
 * quit-application-granted path (PowerBrowserAPI.runQuitFlushSync) and pushes
 * { kind: 'flushShellState', flushId } on the web-tab state channel; this runs
 * the onWillFlush listeners (the session snapshot), stores the shell layout
 * through the stock restorer, saves the map, and acknowledges -- all while the
 * backend still runs. A flush that arrives before the frontend is ready stores
 * nothing (a half-built layout must not overwrite the saved one) and still
 * acknowledges, so the quit is never held for it.
 *
 * Final-review I2: onStop is the unload write. Theia core calls it inside the
 * unload handler, after storeLayout -- the same synchronous store-then-write
 * sequence the stock LocalStorageService gets for free. saveSyncNow dispatches
 * the map synchronously, so a reload (Reset Workbench Layout's own reload, or
 * any frame reload) keeps the layout the page had, not the last quit's.
 */
@injectable()
export class ShellStateFlushContribution implements FrontendApplicationContribution {

    @inject(ProfileStorageService)
    protected readonly storage: ProfileStorageService;

    @inject(ShellLayoutRestorer)
    protected readonly layoutRestorer: ShellLayoutRestorer;

    @inject(FrontendApplicationStateService)
    protected readonly stateService: FrontendApplicationStateService;

    @inject(WebTabChannel)
    protected readonly channel: WebTabChannel;

    /** Subscribed through the channel's router: one window listener serves every push kind. */
    onStart(app: FrontendApplication): void {
        this.channel.onPush(SHELL_FLUSH_KIND, detail => {
            if (typeof detail.flushId === 'string') {
                void this.flush(app, detail.flushId);
            }
        });
    }

    protected async flush(app: FrontendApplication, flushId: string): Promise<void> {
        try {
            if (this.stateService.state === 'ready') {
                await this.storage.fireWillFlush();
                this.layoutRestorer.storeLayout(app);
                await this.storage.save();
            }
        } catch (error) {
            console.error('[@powerbrowser/tab-uris] shell state flush failed:', error);
        } finally {
            await this.storage.acknowledgeFlush(flushId);
        }
    }

    /**
     * Final-review I2: runs inside Theia core's unload handler, after
     * storeLayout wrote the current layout into the map. Dispatches the map
     * synchronously so the write reaches chrome before the document goes
     * away. Ordering with saveSession: the quit-flush path already handled
     * real quits; this covers reloads, where no flush ever runs.
     */
    onStop(): void {
        try {
            this.storage.saveSyncNow();
        } catch {
            // Best-effort at unload: no tick left to report through.
        }
    }
}
