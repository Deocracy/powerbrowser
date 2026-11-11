/**
 * Phase 65 (TAB-08; P65-18, P65-19, P65-29, P65-32, P65-35; interfaces N-1, N-4):
 * pb-orca: names that survive a relaunch, and the opener that resolves them
 * while a Setup or the session restores.
 *
 * OrcaPaneNameMap keeps name -> { kind, worktreeId, tabId, paneKey, tombstone? }
 * in ProfileStorageService under powerbrowser.orca.paneNames (not
 * workspace-prefixed). The observer seeds planPanes with it, records every mint
 * and turns an entry whose Orca pane is gone into a tombstone. A tombstone keeps
 * its name out of minting until no saved Setup and no session snapshot names it;
 * the launch prune drops it then (P65-18 amending P64-16).
 *
 * OrcaPaneRestoreOpenHandler answers a named pb-orca: URI at once (canHandle
 * 1001; Phase 64's handler keeps the empty path): a page word gives its
 * singleton page widget, a live entry gives its widget, created from the
 * entry's options when none is open, which shows Orca's own waiting state until
 * the store has the tab and is then adopted by key (or disposed by the observer
 * once the tab is known gone). A tombstone or an unknown name opens nothing, so
 * Setups' own dropped path and notice apply. Terminal leaves restore the same
 * way; PB issues no respawn call (P65-29).
 */
import { inject, injectable, interfaces } from '@theia/core/shared/inversify';
import { ApplicationShell, FrontendApplicationContribution, OpenHandler, WidgetManager } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { ORCA_PANE_FACTORY_ID } from '@powerbrowser/tab-uris/lib/browser/orca-scheme-coverage';
import { ProfileStorageService } from '@powerbrowser/tab-uris/lib/browser/profile-storage';
import { SetupsService } from '@powerbrowser/modes/lib/browser/setups-service';
import { OrcaPaneOptions, OrcaPanePick } from '../../common/orca-panes-protocol';
import { ORCA_PANE_WIDGET_ID_PREFIX, PAGE_WORDS, keyOfOptions } from '../orca-pane-routes';
import { OrcaPaneWidget } from '../orca-pane-widget';

const LOG_PREFIX = '[@powerbrowser/orca-panes]';

/** N-4: the profile storage key of the name map. */
export const ORCA_PANE_NAMES_KEY = 'powerbrowser.orca.paneNames';

export interface OrcaPaneNameEntry extends OrcaPanePick {
    tombstone?: true;
}

/** pb-orca:x, :/x, :///x and ://x name the same tab (as TabUriRegistry.parseName and Phase 64's opener read it). */
export const orcaNameOf = (uri: URI): string => uri.authority || uri.path.toString().replace(/^\/+/, '');

/** A stored entry, or undefined when the stored value is not one (the map is profile data, read defensively). */
function entryOf(value: unknown): OrcaPaneNameEntry | undefined {
    const v = value as Partial<OrcaPaneNameEntry> | null;
    if (!v || typeof v !== 'object' || typeof v.kind !== 'string' || typeof v.worktreeId !== 'string' || typeof v.tabId !== 'string' || !v.tabId
        || !(v.paneKey === null || typeof v.paneKey === 'string')) {
        return undefined;
    }
    return { kind: v.kind, worktreeId: v.worktreeId, tabId: v.tabId, paneKey: v.paneKey, ...(v.tombstone === true ? { tombstone: true as const } : {}) };
}

@injectable()
export class OrcaPaneNameMap {

    @inject(ProfileStorageService)
    protected readonly storage: ProfileStorageService;

    protected loading: Promise<Map<string, OrcaPaneNameEntry>> | undefined;

    protected load(): Promise<Map<string, OrcaPaneNameEntry>> {
        this.loading ??= this.storage.getData<unknown>(ORCA_PANE_NAMES_KEY).then(raw => {
            const map = new Map<string, OrcaPaneNameEntry>();
            for (const [name, value] of Object.entries(raw && typeof raw === 'object' ? raw as Record<string, unknown> : {})) {
                const entry = entryOf(value);
                if (entry && /^[a-z]+\d+$/.test(name)) {
                    map.set(name, entry);
                }
            }
            return map;
        }, () => new Map<string, OrcaPaneNameEntry>());
        return this.loading;
    }

    protected async save(map: Map<string, OrcaPaneNameEntry>): Promise<void> {
        await this.storage.setData(ORCA_PANE_NAMES_KEY, Object.fromEntries(map));
    }

    /** Live entries: Orca key -> name. */
    async namesByKey(): Promise<Map<string, string>> {
        return new Map([...await this.load()].filter(([, e]) => !e.tombstone).map(([name, e]) => [keyOfOptions(e), name]));
    }

    /** Every name the map holds, live or tombstone. */
    async reservedNames(): Promise<string[]> {
        return [...(await this.load()).keys()];
    }

    /** Live entries as [name, entry]. */
    async live(): Promise<Array<[string, OrcaPaneNameEntry]>> {
        return [...await this.load()].filter(([, e]) => !e.tombstone);
    }

    async lookup(name: string): Promise<OrcaPaneNameEntry | undefined> {
        return (await this.load()).get(name);
    }

    /** A mint or an adoption: name -> its Orca identity, live. */
    async record(name: string, identity: OrcaPanePick): Promise<void> {
        const map = await this.load();
        const entry: OrcaPaneNameEntry = { kind: identity.kind, worktreeId: identity.worktreeId, tabId: identity.tabId, paneKey: identity.paneKey };
        if (JSON.stringify(map.get(name)) !== JSON.stringify(entry)) {
            map.set(name, entry);
            await this.save(map);
        }
    }

    /** The Orca pane with this key is gone: its live entry becomes a tombstone. */
    async markGone(key: string): Promise<void> {
        const map = await this.load();
        let changed = false;
        for (const entry of map.values()) {
            if (!entry.tombstone && keyOfOptions(entry) === key) {
                entry.tombstone = true;
                changed = true;
            }
        }
        if (changed) {
            await this.save(map);
        }
    }

    /** Launch: drops each tombstone whose pb-orca:<name> no saved Setup and no session snapshot names. */
    async prune(referencedUris: Iterable<string>): Promise<number> {
        const referenced = new Set([...referencedUris].filter(uri => uri.startsWith('pb-orca:')).map(uri => uri.slice('pb-orca:'.length).replace(/^\/+/, '')));
        const map = await this.load();
        const gone = [...map].filter(([name, e]) => e.tombstone && !referenced.has(name)).map(([name]) => name);
        gone.forEach(name => map.delete(name));
        if (gone.length) {
            await this.save(map);
        }
        return gone.length;
    }
}

/** Prunes the name map's tombstones once at start, against setups.json and the session snapshot (P65-18). */
@injectable()
export class OrcaPaneNameMapContribution implements FrontendApplicationContribution {

    @inject(OrcaPaneNameMap)
    protected readonly names: OrcaPaneNameMap;

    @inject(SetupsService)
    protected readonly setups: SetupsService;

    onStart(): void {
        this.setups.referencedTabUris()
            .then(uris => this.names.prune(uris))
            .catch(err => console.info(`${LOG_PREFIX} the pb-orca name map was not pruned: ${(err as Error)?.message ?? 'unknown error'}`));
    }
}

/**
 * P65-19: a named pb-orca: URI resolved at once, never awaiting Orca's store, so a Setup restore that runs before
 * orcad is ready still places every Orca tab in its saved split.
 */
@injectable()
export class OrcaPaneRestoreOpenHandler implements OpenHandler {

    readonly id = 'powerbrowser.orca-pane-restore-open-handler';

    @inject(OrcaPaneNameMap)
    protected readonly names: OrcaPaneNameMap;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    /** Above Phase 64's 1000 for a named URI only; the empty path stays Phase 64's (focus the last active hosted tab). */
    canHandle(uri: URI): number {
        return uri.scheme === 'pb-orca' && orcaNameOf(uri) ? 1001 : 0;
    }

    async open(uri: URI): Promise<OrcaPaneWidget | undefined> {
        const name = orcaNameOf(uri);
        const widget = await this.widgetFor(name);
        if (!widget) {
            return undefined;
        }
        if (!widget.isAttached) {
            await this.shell.addWidget(widget, { area: 'main' });
        }
        await this.shell.activateWidget(widget.id);
        return widget;
    }

    protected async widgetFor(name: string): Promise<OrcaPaneWidget | undefined> {
        const pageKind = Object.prototype.hasOwnProperty.call(PAGE_WORDS, name) ? PAGE_WORDS[name] : undefined;
        if (pageKind) {
            // N-1: a page tab is a singleton keyed by its options; no Orca tab backs it.
            const page: OrcaPaneOptions = { name, kind: pageKind, worktreeId: '', tabId: '', paneKey: null };
            return this.widgetManager.getOrCreateWidget<OrcaPaneWidget>(ORCA_PANE_FACTORY_ID, page);
        }
        const open = (this.widgetManager.getWidgets(ORCA_PANE_FACTORY_ID) as OrcaPaneWidget[])
            .find(w => w.id === ORCA_PANE_WIDGET_ID_PREFIX + name && !w.isDisposed);
        if (open) {
            return open;
        }
        const entry = await this.names.lookup(name);
        if (!entry || entry.tombstone) {
            console.info(`${LOG_PREFIX} pb-orca:${name} ${entry ? 'names a closed Orca tab' : 'names no Orca tab'}`);
            return undefined;
        }
        // The observer's order of option keys, so the WidgetManager key matches a layout-restored widget's.
        const options: OrcaPaneOptions = { name, kind: entry.kind, worktreeId: entry.worktreeId, tabId: entry.tabId, paneKey: entry.paneKey };
        return this.widgetManager.getOrCreateWidget<OrcaPaneWidget>(ORCA_PANE_FACTORY_ID, options);
    }
}

/** The name map, its launch prune and the restore opener (one call in orca-panes-frontend-module, P65-32's merge rule). */
export function bindOrcaRestore(bind: interfaces.Bind): void {
    bind(OrcaPaneNameMap).toSelf().inSingletonScope();
    bind(OrcaPaneNameMapContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(OrcaPaneNameMapContribution);
    bind(OrcaPaneRestoreOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(OrcaPaneRestoreOpenHandler);
}
