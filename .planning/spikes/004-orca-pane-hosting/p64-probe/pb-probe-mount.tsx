// Phase 64 research probe (P64-03, P64-23, P64-20): the spike 004 pane entry, extended with one
// mount per hosted content type. build-probe.sh copies it to orca/src/renderer/src/pb/ (untracked)
// for the build and removes it afterwards. Nothing in Orca's tree is edited.
//
// Each mount is a separate React root on the host's React (Route A), as the product widget will be.
// Mount errors are captured through createRoot's onCaughtError / onUncaughtError, so a mount that
// throws (a missing provider, a missing store field) is recorded with its message, never as a blank.
import '../assets/main.css'

import * as React from 'react'
import * as ReactDOMClient from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConfirmationDialogProvider } from '../components/confirmation-dialog'
import { LinkRoutingPreferenceDialogProvider } from '../components/link-routing-preference-dialog'
import TerminalPane from '../components/terminal-pane/TerminalPane'
import NativeChatView from '../components/native-chat/NativeChatView'
import EmulatorPane from '../components/emulator-pane/EmulatorPane'
import EditorPanel from '../components/editor/EditorPanel'
import { closeTerminalTab } from '../components/terminal/terminal-tab-actions'
import { createNewTerminalTab } from '../components/terminal/terminal-tab-create'
import { ensureSimulatorTab } from '../lib/ensure-simulator-tab'
import {
  structuredAgentSessionOwnerForTab,
  structuredAgentSessionTargetForHost
} from '../runtime/structured-agent-session-owner'
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
import { callRuntimeResult } from '../web/preload-api/web-runtime-calls'
import {
  createStoredWebRuntimeEnvironment,
  readStoredWebRuntimeEnvironment,
  saveStoredWebRuntimeEnvironment
} from '../web/web-runtime-environment'

type PanePick = { worktreeId: string; tabId: string }
type TabRef = { id: string; unifiedId: string; worktreeId: string; contentType: string; executionHostId: string | null }
type TabChange = { opened: TabRef[]; closed: TabRef[]; at: number }
type MountKind = 'terminal' | 'agent-session' | 'simulator' | 'conflict-review' | 'check-details'

export const reactIdentity = React
export const reactVersion = React.version

export function now(): number {
  return performance.timeOrigin + performance.now()
}

const noop = (): void => {}

function Services({ appearance, persistence }: { appearance: boolean; persistence: boolean }): null {
  useAppShellServices()
  useAppStartupHydration(noop)
  // Probe (P64-23): the flag is fixed for the root's lifetime, so the conditional hook is stable.
  if (persistence) {
    useAppSessionPersistence()
  }
  useRuntimeGraphSync()
  useWebSessionTabsSync()
  // Probe: appearance writes html class and style; the CSS probe runs with it, as the spike did.
  if (appearance) {
    useDocumentAppearance()
  }
  return null
}

function Providers({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <I18nProvider>
      <TooltipProvider delayDuration={400}>
        <ConfirmationDialogProvider>
          <LinkRoutingPreferenceDialogProvider>{children}</LinkRoutingPreferenceDialogProvider>
        </ConfirmationDialogProvider>
      </TooltipProvider>
    </I18nProvider>
  )
}

let booted: Promise<void> | null = null

export function bootstrap(
  options: { pairing?: string | null; appearance?: boolean; persistence?: boolean; sessionOnly?: boolean } = {}
): Promise<void> {
  booted ??= (async () => {
    await initWebDeviceKeySupport().catch((error: unknown) =>
      console.warn('[pb-probe] device key probe failed', error)
    )
    const offer = options.pairing ? parseWebPairingInput(options.pairing) : null
    if (offer?.scope === 'runtime') {
      const environment = createStoredWebRuntimeEnvironment({
        name: 'Orca Server',
        offer,
        previousEnvironment: readStoredWebRuntimeEnvironment()
      })
      // P64-07 probe: Orca's own session-only form keeps the device token in page memory.
      saveStoredWebRuntimeEnvironment(options.sessionOnly ? { ...environment, sessionOnly: true } : environment)
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
        <Services appearance={options.appearance !== false} persistence={options.persistence !== false} />
      </Providers>
    )
  })()
  return booted
}

type State = ReturnType<typeof useAppStore.getState>

function worktreePathOf(state: State, worktreeId: string): string {
  for (const list of Object.values(state.worktreesByRepo)) {
    for (const worktree of list) {
      if (worktree.id === worktreeId) {
        return worktree.path
      }
    }
  }
  return ''
}

/** The spike's terminal pane, unchanged (the CSS measure mounts this one). */
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

/** One hosted content type, mounted the way its overlay slot mounts it, minus RetainedPaneHost. */
function KindBody({ kind, worktreeId, tabId, sessionId }: { kind: MountKind; worktreeId: string; tabId: string; sessionId?: string }): React.JSX.Element {
  const unified = useAppStore((state) => (state.unifiedTabsByWorktree[worktreeId] ?? []).find((t) => t.id === tabId) ?? null)
  const owner = useAppStore((state) => structuredAgentSessionOwnerForTab(state, { worktreeId, executionHostId: unified?.executionHostId }))
  const worktreePath = useAppStore((state) => worktreePathOf(state, worktreeId))
  const terminal = useAppStore((state) => (state.tabsByWorktree[worktreeId] ?? []).find((t) => t.id === tabId) ?? null)
  if (kind === 'agent-session') {
    const target = structuredAgentSessionTargetForHost(owner)
    if (!target) {
      return <div data-pb-probe-state="no-target" />
    }
    return (
      <NativeChatView
        mode="structured"
        tabId={tabId}
        groupId={unified?.groupId}
        sessionId={sessionId ?? unified?.entityId ?? tabId}
        agent={(unified?.agentSessionAgent ?? 'claude') as never}
        isVisible
        isFocusedGroup
        target={target}
      />
    )
  }
  if (kind === 'simulator') {
    const tab = unified ?? ({ id: tabId, entityId: tabId, groupId: '', worktreeId, contentType: 'simulator', label: 'Simulator', customLabel: null, color: null, sortOrder: 0, createdAt: Date.now() } as const)
    return <EmulatorPane tab={tab as never} worktreeId={worktreeId} isActive />
  }
  if (kind === 'conflict-review' || kind === 'check-details') {
    return <EditorPanel activeFileId={tabId} activeViewStateId={tabId} isVisible isCmdSaveOwner />
  }
  if (!terminal || !worktreePath) {
    return <div data-pb-probe-state="waiting-terminal" />
  }
  return (
    <TerminalPane
      key={`${tabId}-${terminal.generation ?? 0}`}
      tabId={tabId}
      worktreeId={worktreeId}
      cwd={terminal.startupCwd ?? worktreePath}
      isActive
      isVisible
      isWorktreeActive
      onPtyExit={noop}
      onCloseTab={noop}
    />
  )
}

export const mountErrors: { kind: string; phase: string; message: string }[] = []

/** A separate root per pane on the host React, with its errors recorded. Returns the unmount function. */
export function mountKind(element: HTMLElement, pick: { kind: MountKind; worktreeId: string; tabId: string; sessionId?: string }): () => void {
  const record = (phase: string) => (error: unknown) => {
    mountErrors.push({ kind: pick.kind, phase, message: String((error as Error)?.message ?? error).slice(0, 400) })
  }
  const root = ReactDOMClient.createRoot(element, {
    onCaughtError: record('caught'),
    onUncaughtError: record('uncaught'),
    onRecoverableError: record('recoverable')
  })
  root.render(
    <Providers>
      <div data-pb-pane-root={pick.tabId} data-pb-probe-kind={pick.kind} style={{ position: 'relative', display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: 0 }}>
        <KindBody {...pick} />
      </div>
    </Providers>
  )
  return () => root.unmount()
}

export function mountPane(element: HTMLElement, pick: PanePick): () => void {
  const root = ReactDOMClient.createRoot(element)
  root.render(<PaneRoot {...pick} />)
  return () => root.unmount()
}

function tabRefs(state: State): Map<string, TabRef> {
  const refs = new Map<string, TabRef>()
  for (const [worktreeId, tabs] of Object.entries(state.unifiedTabsByWorktree)) {
    for (const tab of tabs) {
      const id = tab.contentType === 'terminal' ? tab.entityId : tab.id
      refs.set(id, { id, unifiedId: tab.id, worktreeId, contentType: tab.contentType, executionHostId: tab.executionHostId ?? null })
    }
  }
  return refs
}

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

/** What the harness reads. No credential. */
export function state(): Record<string, unknown> {
  const store = useAppStore.getState()
  return {
    ready: store.workspaceSessionReady,
    activeWorktreeId: store.activeWorktreeId,
    visibility: document.visibilityState,
    worktrees: Object.values(store.worktreesByRepo)
      .flat()
      .map((worktree) => ({ id: worktree.id, path: worktree.path })),
    terminals: Object.entries(store.tabsByWorktree).flatMap(([worktreeId, tabs]) =>
      tabs.map((tab) => ({ id: tab.id, worktreeId, ptyId: tab.ptyId }))
    ),
    tabs: [...tabRefs(store).values()],
    openFiles: store.openFiles.map((file) => ({ id: file.id, mode: file.mode, worktreeId: file.worktreeId })),
    mobileEmulatorEnabled: store.settings?.mobileEmulatorEnabled ?? null
  }
}

export function setActiveWorktree(worktreeId: string): void {
  useAppStore.getState().setActiveWorktree(worktreeId)
}

export function newTerminal(worktreeId: string): Promise<boolean> {
  return new Promise((resolve) => createNewTerminalTab(worktreeId, undefined, { onSettled: resolve }))
}

export function newSimulatorTab(worktreeId: string): string | null {
  return ensureSimulatorTab(worktreeId, { placement: 'activeGroup' })
}

export function openConflictReview(worktreeId: string, file: string): string {
  const store = useAppStore.getState()
  store.openConflictReview(worktreeId, worktreePathOf(store, worktreeId), [{ path: file, conflictKind: 'both_modified' }], 'live-summary')
  return `${worktreeId}::conflict-review`
}

export function openCheckDetails(worktreeId: string): string | null {
  const store = useAppStore.getState()
  store.openCheckRunDetails(
    worktreeId,
    'pb-probe-context',
    { name: 'pb-probe check', status: 'completed', conclusion: 'failure', url: null } as never,
    { requestId: 0, details: null, loading: false, error: 'pb-probe: no hosted review in this run', githubRepository: null, gitlabProjectRef: null } as never
  )
  return useAppStore.getState().openFiles.find((file) => file.mode === 'check-details')?.id ?? null
}

export function closeTab(tabId: string): void {
  closeTerminalTab(tabId, { force: true, skipRunningProcessConfirm: true })
}

export function deviceKeySupport(): unknown {
  return readWebDeviceKeySupport()
}

/** The host's own session-tab list for one worktree (P64-23: host-side tab or client-side miss?). */
export async function hostTabs(worktreeId: string): Promise<unknown> {
  const result = await callRuntimeResult<{ tabs?: { id: string; type?: string; kind?: string; terminal?: unknown }[] }>('session.tabs.list', { worktree: `id:${worktreeId}` })
  const tabs = (result as { tabs?: unknown[] }).tabs ?? []
  const r = result as { publicationEpoch?: string; snapshotVersion?: number }
  return { publicationEpoch: String(r.publicationEpoch ?? '').replace(/[0-9a-f-]{36}/g, '<uuid>'), snapshotVersion: r.snapshotVersion, count: tabs.length, kinds: tabs.map((t) => (t as { type?: string; kind?: string }).type ?? (t as { kind?: string }).kind ?? '?'), keys: Object.keys(result as object) }
}

/** A terminal created through the host RPC the CLI uses (terminal.create), from this client. */
export async function hostCreateTerminal(worktreeId: string): Promise<boolean> {
  await callRuntimeResult('terminal.create', { worktree: `id:${worktreeId}` })
  return true
}

/** Re-selects the active worktree (null, then back) to re-install the selected-worktree stream. */
export async function reselectWorktree(worktreeId: string): Promise<void> {
  useAppStore.getState().setActiveWorktree(null as never)
  await new Promise((resolve) => setTimeout(resolve, 300))
  useAppStore.getState().setActiveWorktree(worktreeId)
}
