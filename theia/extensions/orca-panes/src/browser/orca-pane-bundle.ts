/**
 * Phase 64 (P64-05, P64-08, P64-09, P64-26; research A-4, A6; interfaces C2, C3):
 * loads the Orca pane bundle into the Theia document and boots it once.
 *
 * Theia's React is handed to the bundle under one Symbol.for key before the
 * entry loads; the bundle's react, react-dom, react-dom/client and
 * react/jsx-runtime are virtual modules reading that key, so one React runs
 * both (P64-08). The entry is loaded by an inline module script, not a dynamic
 * import written here: this file compiles with module commonjs, which would
 * turn import() into require() (research A-4's recorded fallback). The module
 * script stores the entry's namespace under ORCA_PANES_MODULE_KEY and then
 * dispatches ORCA_PANES_BOOT_EVENT once; checks and Phase 66 reach the bundle
 * through those two literals (C3).
 *
 * Every failure is one log line naming the step, never a value; nothing
 * PB-authored is shown (P64-26). The pairing is passed to bootstrap and then
 * dropped (A6: the bundle keeps it sessionOnly).
 *
 * Audit fix (64-WR-01, pairing-credentials-01, 67-WR-02): a failed boot is not
 * kept for the life of the document. ready() is one promise that resolves at
 * the first boot that succeeds; a failed attempt sets failed, fires
 * onDidChangeState and is tried again after a capped backoff, or at once
 * through retry() (Reconnect, or chrome's state returning to ready). Only a
 * React identity mismatch is final: no later attempt can change it, so ready()
 * rejects then. A retry after a failed load imports the entry under a new
 * query, because a document may keep a failed module fetch in its module map.
 */
import * as React from '@theia/core/shared/react';
import * as ReactDOM from '@theia/core/shared/react-dom';
import * as ReactDOMClient from '@theia/core/shared/react-dom/client';
import * as jsxRuntime from '@theia/core/shared/react/jsx-runtime';
import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { Emitter, Event as TheiaEvent } from '@theia/core/lib/common/event';
import { ProfileStorageService } from '@powerbrowser/tab-uris/lib/browser/profile-storage';
import {
    ORCA_PANES_ENTRY, ORCA_PANES_REACT_KEY, ORCA_PANES_ROUTE_PREFIX, ORCA_PANES_STYLE, OrcaPaneBundleApi, OrcaPanesService
} from '../common/orca-panes-protocol';

/** C3 boot handle: where the module script stores the entry's namespace, and the window event it dispatches once after. */
export const ORCA_PANES_MODULE_KEY = 'powerbrowser.orca-panes.module';
export const ORCA_PANES_BOOT_EVENT = 'powerbrowser-orca-panes-module';

/**
 * Owner ruling 2026-11-17 ("Remember my 'off'"): the user's last write of Orca's Middle-click Paste from Selection switch,
 * a boolean in the profile store beside powerbrowser.orca.paneNames. Orca keeps its own value in this document's
 * localStorage, whose origin changes at every launch, so without this record the bundle's Linux preset came back on.
 */
export const ORCA_PRIMARY_SELECTION_PASTE_KEY = 'powerbrowser.orca.primarySelectionPaste';

const LOG_PREFIX = '[@powerbrowser/orca-panes]';
const LOAD_FAILED_EVENT = ORCA_PANES_BOOT_EVENT + '-failed';

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** The step no later attempt can change: the bundle's React is fixed by its build. */
export const ORCA_PANES_FINAL_STEP = 'identity';
/** Backoff between automatic boot attempts after a failure: 2 s doubling to 30 s. */
const RETRY_FIRST_MS = 2000;
const RETRY_MAX_MS = 30000;

/** The bundle's boot state: booting (an attempt is running or waiting), booted, or failed (the last attempt failed). */
export type OrcaPaneBundleState = 'booting' | 'booted' | 'failed';

@injectable()
export class OrcaPaneBundle implements FrontendApplicationContribution {

    @inject(OrcaPanesService)
    protected readonly service: OrcaPanesService;

    @inject(ProfileStorageService)
    protected readonly storage: ProfileStorageService;

    /** Settles once: resolved by the first boot that succeeds, rejected only by a failure at the final step. */
    protected booted: Promise<OrcaPaneBundleApi> | undefined;
    protected settleBooted: { resolve(api: OrcaPaneBundleApi): void; reject(err: unknown): void } | undefined;
    /** The attempt running now; undefined between attempts. */
    protected attempt: Promise<OrcaPaneBundleApi> | undefined;
    protected retryTimer: ReturnType<typeof setTimeout> | undefined;
    protected retryWait = RETRY_FIRST_MS;
    protected api: OrcaPaneBundleApi | undefined;
    /** The entry module's namespace once it has loaded; a later attempt does not import it again. */
    protected entry: OrcaPaneBundleApi | undefined;
    protected loadFailures = 0;
    protected readonly loggedSteps = new Set<string>();

    protected readonly onDidChangeStateEmitter = new Emitter<OrcaPaneBundleState>();
    /** Fires when state changes: an attempt failed, a new attempt started, or the boot succeeded. */
    readonly onDidChangeState: TheiaEvent<OrcaPaneBundleState> = this.onDidChangeStateEmitter.event;

    /** The step the last attempt failed at; undefined while an attempt runs and once booted. */
    failed: string | undefined;

    onStart(): void {
        // P64-05: boot at frontend start in every mode, so agent-opened panes are observed everywhere.
        this.ready().catch(() => { /* logged once by boot() */ });
    }

    get state(): OrcaPaneBundleState {
        return this.api ? 'booted' : this.failed !== undefined ? 'failed' : 'booting';
    }

    /** True once a boot has succeeded (synchronous, for a close request that cannot wait). */
    get isBooted(): boolean {
        return this.api !== undefined;
    }

    /** Resolves at the first boot that succeeds; rejects only when the boot failed at the final step. */
    ready(): Promise<OrcaPaneBundleApi> {
        if (!this.booted) {
            this.booted = new Promise<OrcaPaneBundleApi>((resolve, reject) => { this.settleBooted = { resolve, reject }; });
            this.start();
        }
        return this.booted;
    }

    /**
     * One attempt now, when the last one failed at a step a later attempt can pass (Reconnect, or chrome's state
     * returning to ready). Resolves with the attempt's outcome: true once booted, false when it failed again.
     */
    retry(): Promise<boolean> {
        if (this.api) {
            return Promise.resolve(true);
        }
        if (this.failed === ORCA_PANES_FINAL_STEP) {
            return Promise.resolve(false);
        }
        this.ready().catch(() => undefined);
        if (!this.attempt) {
            this.start();
        }
        return (this.attempt ?? Promise.reject(new Error('no attempt'))).then(() => true, () => false);
    }

    protected start(): void {
        if (this.retryTimer !== undefined) {
            clearTimeout(this.retryTimer);
            this.retryTimer = undefined;
        }
        const wasFailed = this.failed !== undefined;
        this.failed = undefined;
        const attempt = this.boot();
        this.attempt = attempt;
        if (wasFailed) {
            this.onDidChangeStateEmitter.fire(this.state);
        }
        attempt.then(api => {
            this.attempt = undefined;
            this.api = api;
            this.settleBooted?.resolve(api);
            this.onDidChangeStateEmitter.fire(this.state);
        }, err => {
            this.attempt = undefined;
            this.onDidChangeStateEmitter.fire(this.state);
            if (this.failed === ORCA_PANES_FINAL_STEP) {
                this.settleBooted?.reject(err);
                return;
            }
            const wait = this.retryWait;
            this.retryWait = Math.min(this.retryWait * 2, RETRY_MAX_MS);
            this.retryTimer = setTimeout(() => {
                this.retryTimer = undefined;
                if (!this.attempt && !this.api) {
                    this.start();
                }
            }, wait);
        });
    }

    protected async boot(): Promise<OrcaPaneBundleApi> {
        let step = 'hand-off';
        try {
            (globalThis as Record<symbol, unknown>)[Symbol.for(ORCA_PANES_REACT_KEY)] = { React, ReactDOM, ReactDOMClient, jsxRuntime };
            step = 'pairing';
            // The offer lives only in this frame and goes out of scope when boot() returns (A6).
            const offer = await this.waitForPairing();
            step = 'load';
            this.linkStyle();
            const api = this.entry ??= await this.loadEntry();
            step = ORCA_PANES_FINAL_STEP;
            if (api.reactIdentity !== React) {
                throw new Error('the pane bundle runs a React other than Theia\'s');
            }
            step = 'bootstrap';
            const remembered = await this.storage.getData<unknown>(ORCA_PRIMARY_SELECTION_PASTE_KEY).catch(() => undefined);
            await api.bootstrap({
                ...offer,
                rememberedPrimarySelectionPaste: typeof remembered === 'boolean' ? remembered : undefined,
                rememberPrimarySelectionPaste: value => {
                    this.storage.setData(ORCA_PRIMARY_SELECTION_PASTE_KEY, value)
                        .catch(err => console.warn(`${LOG_PREFIX} the Middle-click Paste from Selection choice was not saved: ${(err as Error)?.message ?? 'unknown error'}`));
                },
            });
            return api;
        } catch (err) {
            this.failed = step;
            if (step === 'load') {
                this.loadFailures += 1;
            }
            const line = `the Orca pane bundle did not boot at the ${step} step: ${(err as Error)?.message ?? 'unknown error'}`;
            if (!this.loggedSteps.has(line)) {
                this.loggedSteps.add(line);
                console.warn(`${LOG_PREFIX} ${line}${step === ORCA_PANES_FINAL_STEP ? '' : '; it is tried again'}`);
            }
            throw err;
        }
    }

    /** Polls the backend's hand-off with a capped backoff (1 s rising to 5 s) until orcad has written the offer. */
    protected async waitForPairing(): Promise<{ pairing: string }> {
        for (let wait = 1000; ; wait = Math.min(wait * 2, 5000)) {
            const offer = await this.service.handOff().catch(() => undefined);
            if (offer && 'pairing' in offer && offer.pairing) {
                return { pairing: offer.pairing };
            }
            await delay(wait);
        }
    }

    protected linkStyle(): void {
        const href = new URL(ORCA_PANES_ROUTE_PREFIX + ORCA_PANES_STYLE, document.baseURI).href;
        if (!document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            document.head.appendChild(link);
        }
    }

    protected loadEntry(): Promise<OrcaPaneBundleApi> {
        const key = Symbol.for(ORCA_PANES_MODULE_KEY);
        return new Promise<OrcaPaneBundleApi>((resolve, reject) => {
            const onLoaded = () => {
                window.removeEventListener(LOAD_FAILED_EVENT, onFailed);
                resolve((globalThis as Record<symbol, unknown>)[key] as OrcaPaneBundleApi);
            };
            const onFailed = () => {
                window.removeEventListener(ORCA_PANES_BOOT_EVENT, onLoaded);
                reject(new Error('the pane bundle entry did not load'));
            };
            window.addEventListener(ORCA_PANES_BOOT_EVENT, onLoaded, { once: true });
            window.addEventListener(LOAD_FAILED_EVENT, onFailed, { once: true });
            const entry = new URL(ORCA_PANES_ROUTE_PREFIX + ORCA_PANES_ENTRY, document.baseURI);
            if (this.loadFailures > 0) {
                // A failed module fetch may stay in the module map under its URL; a new query is a new map entry.
                entry.searchParams.set('attempt', String(this.loadFailures));
            }
            const url = entry.href;
            const script = document.createElement('script');
            script.type = 'module';
            // import() here is page text, not TypeScript, so the commonjs emit cannot rewrite it (research A-4).
            script.textContent = [
                `import(${JSON.stringify(url)}).then(m => {`,
                `  globalThis[Symbol.for(${JSON.stringify(ORCA_PANES_MODULE_KEY)})] = m;`,
                `  window.dispatchEvent(new Event(${JSON.stringify(ORCA_PANES_BOOT_EVENT)}));`,
                `}, () => window.dispatchEvent(new Event(${JSON.stringify(LOAD_FAILED_EVENT)})));`,
            ].join('\n');
            document.head.appendChild(script);
        });
    }
}
