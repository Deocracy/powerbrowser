// Spike 004: one Orca terminal pane outside Orca's shell, plus the read-only tab observation.
// build-pb-entry.sh copies this to orca/src/renderer/src/pb/ (untracked) for the build and removes
// it afterwards. It is the entry of the Route A library bundle (global PbPane) and is imported by
// the pane page (pb-pane.tsx). Nothing in Orca's tree is edited.
//
// Mount shape: TerminalPane is rendered directly into the host element, as Orca's own
// activity-terminal portal does (TerminalOverlaySlot.tsx), not through RetainedPaneHost.
// RetainedPaneHost positions a pane over ONE registered body per tab group
// (tab-group-body-geometry.ts keeps a Map of group id to body), and D-15 gives every pane its
// own Lumino widget, so several panes of one Orca group need several bodies.
import '../assets/main.css'

import * as React from 'react'
import * as ReactDOMClient from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConfirmationDialogProvider } from '../components/confirmation-dialog'
import { LinkRoutingPreferenceDialogProvider } from '../components/link-routing-preference-dialog'
import TerminalPane from '../components/terminal-pane/TerminalPane'
import { closeTerminalTab } from '../components/terminal/terminal-tab-actions'
import { createNewTerminalTab } from '../components/terminal/terminal-tab-create'
import { I18nProvider } from '../i18n/I18nProvider'
import { useAppStore } from '../store'
import { useAppSessionPersistence } from '../app-shell/use-app-session-persistence'
import { useAppShellServices } from '../app-shell/use-app-shell-services'
import { useAppStartupHydration } from '../app-shell/use-app-startup-hydration'
import { useDocumentAppearance } from '../app-shell/use-document-appearance'
import { useRuntimeGraphSync } from '../app-shell/use-runtime-graph-sync'
import { useWebSessionTabsSync } from '../runtime/web-session-tabs-sync/use-web-session-tabs-sync'
import { initWebDeviceKeySupport, readWebDeviceKeySupport } from '../web/web-device-key-support'
import { parseWebPairingInput } from '../web/web-pairing'
import { installWebPreloadApi } from '../web/web-preload-api'
import {
  createStoredWebRuntimeEnvironment,
  readStoredWebRuntimeEnvironment,
  saveStoredWebRuntimeEnvironment
} from '../web/web-runtime-environment'

type PanePick = { worktreeId: string; tabId: string }
type TabRef = { id: string; unifiedId: string; worktreeId: string; contentType: string }
type TabChange = { opened: TabRef[]; closed: TabRef[]; at: number }

/** The React this bundle runs on; the Route A harness compares it with Theia's by identity. */
export const reactIdentity = React
export const reactVersion = React.version

/** Epoch milliseconds with sub-millisecond resolution, comparable across documents on one host. */
export function now(): number {
  return performance.timeOrigin + performance.now()
}

const noop = (): void => {}

// The App-level hooks a pane depends on (App.tsx), without App's shell: hydration fills the
// store from orcad, the shell services carry PTY and session events, persistence and graph sync
// publish this client's state back. useWebSessionTabsSync (ActiveWorkspaceSyncGate in
// AppBackgroundServices) is what lists orcad's terminals as tabs of the active worktree.
function Services(): null {
  useAppShellServices()
  useAppStartupHydration(noop)
  useAppSessionPersistence()
  useRuntimeGraphSync()
  useWebSessionTabsSync()
  useDocumentAppearance()
  return null
}

function Providers({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <I18nProvider>
      <TooltipProvider delayDuration={400}>
        <ConfirmationDialogProvider>
          {/* TerminalPane throws outside this provider (measured: the first mount rendered nothing). */}
          <LinkRoutingPreferenceDialogProvider>{children}</LinkRoutingPreferenceDialogProvider>
        </ConfirmationDialogProvider>
      </TooltipProvider>
    </I18nProvider>
  )
}

let booted: Promise<void> | null = null

/**
 * The web bootstrap of web/main.tsx, once per document: device-key probe, the pairing offer
 * (handed in, never read from location here), window.api, and the startup hooks on a hidden root.
 */
export function bootstrap(options: { pairing?: string | null } = {}): Promise<void> {
  booted ??= (async () => {
    await initWebDeviceKeySupport().catch((error: unknown) =>
      console.warn('[pb-pane] device key probe failed', error)
    )
    const offer = options.pairing ? parseWebPairingInput(options.pairing) : null
    if (offer?.scope === 'runtime') {
      saveStoredWebRuntimeEnvironment(
        createStoredWebRuntimeEnvironment({
          name: 'Orca Server',
          offer,
          previousEnvironment: readStoredWebRuntimeEnvironment()
        })
      )
    }
    if (readStoredWebRuntimeEnvironment() === null) {
      throw new Error('no runtime pairing offer and no stored environment')
    }
    installWebPreloadApi()
    const host = document.createElement('div')
    host.hidden = true
    host.setAttribute('data-pb-pane-services', '')
    document.body.appendChild(host)
    ReactDOMClient.createRoot(host).render(
      <Providers>
        <Services />
      </Providers>
    )
  })()
  return booted
}

function worktreePathOf(state: ReturnType<typeof useAppStore.getState>, worktreeId: string): string {
  for (const list of Object.values(state.worktreesByRepo)) {
    for (const worktree of list) {
      if (worktree.id === worktreeId) {
        return worktree.path
      }
    }
  }
  return ''
}

/** One terminal pane filling its parent. Rendered by Theia's React in Route A. */
export function PaneRoot({ worktreeId, tabId }: PanePick): React.JSX.Element {
  const tab = useAppStore((state) =>
    (state.tabsByWorktree[worktreeId] ?? []).find((entry) => entry.id === tabId)
  )
  const worktreePath = useAppStore((state) => worktreePathOf(state, worktreeId))
  if (!tab || !worktreePath) {
    return <div data-pb-pane-root={tabId} data-pb-pane-state="waiting" />
  }
  return (
    <Providers>
      <div
        data-pb-pane-root={tabId}
        data-pb-pane-state="mounted"
        style={{ position: 'relative', display: 'flex', width: '100%', height: '100%', minHeight: 0 }}
      >
        <TerminalPane
          key={`${tabId}-${tab.generation ?? 0}`}
          tabId={tabId}
          worktreeId={worktreeId}
          cwd={tab.startupCwd ?? worktreePath}
          isActive
          isVisible
          isWorktreeActive
          onPtyExit={() => closeTerminalTab(tabId, { reason: 'pty-exit' })}
          onCloseTab={() => closeTerminalTab(tabId)}
        />
      </div>
    </Providers>
  )
}

/** A separate root on the same React; returns the unmount function. */
export function mountPane(element: HTMLElement, pick: PanePick): () => void {
  const root = ReactDOMClient.createRoot(element)
  root.render(<PaneRoot {...pick} />)
  return () => root.unmount()
}

function tabRefs(state: ReturnType<typeof useAppStore.getState>): Map<string, TabRef> {
  const refs = new Map<string, TabRef>()
  for (const [worktreeId, tabs] of Object.entries(state.unifiedTabsByWorktree)) {
    for (const tab of tabs) {
      // A terminal's pane is keyed by its terminal tab id (entityId), the id PaneRoot takes.
      const id = tab.contentType === 'terminal' ? tab.entityId : tab.id
      refs.set(id, { id, unifiedId: tab.id, worktreeId, contentType: tab.contentType })
    }
  }
  return refs
}

/** Read-only layout observation (P61-11): the renderer store, diffed by tab id. */
export function subscribeTabs(callback: (change: TabChange) => void): () => void {
  let previous = tabRefs(useAppStore.getState())
  return useAppStore.subscribe((state, prior) => {
    if (
      state.unifiedTabsByWorktree === prior.unifiedTabsByWorktree &&
      state.groupsByWorktree === prior.groupsByWorktree &&
      state.layoutByWorktree === prior.layoutByWorktree
    ) {
      return
    }
    const next = tabRefs(state)
    const opened = [...next.values()].filter((ref) => !previous.has(ref.id))
    const closed = [...previous.values()].filter((ref) => !next.has(ref.id))
    previous = next
    if (opened.length > 0 || closed.length > 0) {
      callback({ opened, closed, at: now() })
    }
  })
}

/** What the harness reads: hydration state, worktrees and terminal tabs. No credential. */
export function state(): {
  ready: boolean
  activeWorktreeId: string | null
  worktrees: { id: string; path: string }[]
  terminals: { id: string; worktreeId: string; ptyId: string | null }[]
  tabs: TabRef[]
} {
  const store = useAppStore.getState()
  return {
    ready: store.workspaceSessionReady,
    activeWorktreeId: store.activeWorktreeId,
    worktrees: Object.values(store.worktreesByRepo)
      .flat()
      .map((worktree) => ({ id: worktree.id, path: worktree.path })),
    terminals: Object.entries(store.tabsByWorktree).flatMap(([worktreeId, tabs]) =>
      tabs.map((tab) => ({ id: tab.id, worktreeId, ptyId: tab.ptyId }))
    ),
    tabs: [...tabRefs(store).values()]
  }
}

/**
 * Resolves the wanted terminal tab, or the first one, once the hydrated store lists it. With
 * `create` and no wanted tab, an empty workspace gets one terminal through the store's own
 * action: a terminal the Orca CLI creates while no client is attached is a background handle,
 * not a tab (measured in this spike), so the page cannot rely on one being there.
 */
export async function waitForTerminal(
  wanted: string | null,
  timeoutMs: number,
  create = false
): Promise<PanePick> {
  const end = Date.now() + timeoutMs
  let created = false
  for (;;) {
    const snapshot = state()
    const hit = snapshot.terminals.find((tab) => (wanted ? tab.id === wanted : true))
    if (hit) {
      return { worktreeId: hit.worktreeId, tabId: hit.id }
    }
    // Tabs are listed per activated worktree; a pane page has no sidebar to activate one.
    if (snapshot.ready && !snapshot.activeWorktreeId && snapshot.worktrees.length > 0) {
      useAppStore.getState().setActiveWorktree(snapshot.worktrees[0].id)
    }
    if (snapshot.ready && snapshot.activeWorktreeId && !wanted && create && !created) {
      created = true
      void newTerminal(snapshot.activeWorktreeId)
    }
    if (Date.now() > end) {
      throw new Error(`no terminal tab in the store after ${timeoutMs} ms: ${JSON.stringify(snapshot)}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

/** The store's own new-terminal action (the Orca-side pane open the observation watches for). */
export function newTerminal(worktreeId: string): Promise<boolean> {
  return new Promise((resolve) => createNewTerminalTab(worktreeId, undefined, { onSettled: resolve }))
}

/** The one write: the store close action a Lumino-side close must call. */
export function closeTab(tabId: string): void {
  closeTerminalTab(tabId, { force: true, skipRunningProcessConfirm: true })
}

export function deviceKeySupport(): unknown {
  return readWebDeviceKeySupport()
}
