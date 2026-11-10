// PowerBrowser overlay file (Phase 64, TAB-04, TAB-06, TERM-01; P64-04, P64-30..P64-32, D-29):
// the Orca pane bundle entry. scripts/build-orca.sh copies it to orca/src/renderer/src/pb/ and
// scripts/build-orca-panes.sh compiles it with Orca's own Vite (vite.pb-panes.config.ts) into
// orca/out/web/assets/pb-panes/pb-panes.js, an ES module that runs on the host document's React.
// Its named exports are the bundle API of 64-01-PLAN.md interfaces C3; nothing in Orca's tree is
// edited. Each pane is a separate React root on the host React, mounted the way Orca mounts it.
//
// Rules this file keeps (64-RESEARCH A4, D-29): it imports no client-side terminal creation
// (createNewTerminalTab, createWebRuntimeSessionTerminal, anything that issues the session-tabs
// terminal create method), nothing under components/tab-bar/ and not TabGroupPanel. A
// terminal is created only through the host RPC terminal.create.
import '../assets/main.css'

import * as React from 'react'
import ReactObject from 'react'
import * as ReactDOMClient from 'react-dom/client'
// @ts-expect-error -- virtual module served by vite.pb-panes.config.ts's marker plugin
import { PB_CONFIG_MARKERS } from 'virtual:pb-panes-markers'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConfirmationDialogProvider } from '../components/confirmation-dialog'
import { LinkRoutingPreferenceDialogProvider } from '../components/link-routing-preference-dialog'
import PinnedTabCloseDialog from '../components/terminal-pane/PinnedTabCloseDialog'
import RunningTerminalCloseDialog from '../components/terminal-pane/RunningTerminalCloseDialog'
import TerminalPane from '../components/terminal-pane/TerminalPane'
import { requestActiveTerminalPaneClose } from '../components/terminal-pane/request-active-terminal-pane-close'
import NativeChatView from '../components/native-chat/NativeChatView'
import EmulatorPane from '../components/emulator-pane/EmulatorPane'
import EditorPanel from '../components/editor/EditorPanel'
import { closeTerminalTab } from '../components/terminal/terminal-tab-actions'
import { createWorkspaceTabCloseCommands } from '../components/tab-group/workspace-tab-close-commands'
import { ensureSimulatorTab } from '../lib/ensure-simulator-tab'
import { adoptAgentSessionLaunchVerdict } from '../lib/agent-session-launch-plan'
import { newAgentLaunchRequestId } from '../lib/agent-launch-request-id'
import { beginStructuredAgentSessionProvisionalLaunch } from '../lib/agent-session/structured-agent-session-provisional-tab'
import {
  structuredAgentSessionOwnerForTab,
  structuredAgentSessionTargetForHost
} from '../runtime/structured-agent-session-owner'
import { readStructuredChatTabName } from '../runtime/structured-chat-tab-name'
import { I18nProvider } from '../i18n/I18nProvider'
import { useAppStore } from '../store'
import { AppBackgroundServices } from '../app-shell/AppBackgroundServices'
import { useAppSessionPersistence } from '../app-shell/use-app-session-persistence'
import { useAppShellServices } from '../app-shell/use-app-shell-services'
import { useAppStartupHydration } from '../app-shell/use-app-startup-hydration'
import { useDocumentAppearance } from '../app-shell/use-document-appearance'
import { useRuntimeGraphSync } from '../app-shell/use-runtime-graph-sync'
import { initWebDeviceKeySupport } from '../web/web-device-key-support'
import { parseWebPairingInput } from '../web/web-pairing'
import { installWebPreloadApi } from '../web/web-preload-api'
import { callRuntimeResult } from '../web/preload-api/web-runtime-calls'
import {
  createStoredWebRuntimeEnvironment,
  readStoredWebRuntimeEnvironment,
  saveStoredWebRuntimeEnvironment
} from '../web/web-runtime-environment'
import { makePaneKey } from '../../../shared/stable-pane-id'
import { CLIENT_NAVIGATION_PUBLICATION_EPOCH_SUFFIX } from '../../../shared/runtime-session-contracts'
import { resolveUnifiedTabLabel } from '../../../shared/tab-title-resolution'
import type { Tab, TabGroupLayoutNode } from '../../../shared/tab-types'
import type { TerminalPaneLayoutNode } from '../../../shared/terminal-tab-types'
import type { TuiAgent } from '../../../shared/tui-agent'

const ENTRY_MARKER = 'pb-overlay:src/renderer/src/pb/pb-pane-mount.tsx'

/** The marker literals of the entry, the Vite config and the scoping pass (orca-overlay-built reads them). */
export const PB_OVERLAY_BUILD: readonly string[] = Object.freeze([
  ENTRY_MARKER,
  ...(PB_CONFIG_MARKERS as readonly string[])
])

/** The React object this bundle runs on (the default export: the host's React object itself, not a
 * namespace copy); the orca-panes loader compares it with Theia's. */
export const reactIdentity = ReactObject

export type NeighbourMode = 'split-right' | 'split-left' | 'split-bottom' | 'split-top' | 'tab-after'

export type OrcaPaneRecord = {
  key: string
  kind: string
  worktreeId: string
  worktreeLabel: string
  tabId: string
  paneKey: string | null
  browserPageId?: string | null
  active: boolean
  title: string
  neighbours: Array<{ key: string; mode: NeighbourMode }>
}

export type PanePick = { kind: string; worktreeId: string; tabId: string; paneKey: string | null }

type MountError = { kind: string; phase: string; message: string }
type State = ReturnType<typeof useAppStore.getState>

const mountErrors: MountError[] = []
let isBooted = false
let booting: Promise<void> | null = null

function recordError(kind: string, phase: string) {
  return (error: unknown): void => {
    mountErrors.push({ kind, phase, message: String((error as Error)?.message ?? error).slice(0, 400) })
  }
}

function rootOptions(kind: string): ReactDOMClient.RootOptions {
  return {
    onCaughtError: recordError(kind, 'caught'),
    onUncaughtError: recordError(kind, 'uncaught'),
    onRecoverableError: recordError(kind, 'recoverable')
  }
}

const noop = (): void => {}

/** The spike's four providers (spike 004), around every pane root and the services root. */
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

/** The startup hooks App runs, minus its window chrome (P64-04, Pattern 3). */
function Services(): null {
  useAppShellServices()
  useAppStartupHydration(noop)
  useAppSessionPersistence()
  useRuntimeGraphSync()
  useDocumentAppearance()
  return null
}

// 64-MIRROR-FREEZE.md: when this client activates or creates a tab (every TerminalPane attach
// activates its pane), the pinned host projects the frame it sends back to this client twice, so its
// epoch ends in ':client-navigation:client-navigation'. Orca's mirror reads that as a new publisher,
// retires the real '<epoch>:client-navigation' and then drops every later host frame. Each echo is
// passed on as version 0 of the real epoch instead: Orca's own freshness check ignores its tabs, and
// its sender scopes and retirement proofs (delta-encoded per stream) are still read.
const NAVIGATION_ECHO = CLIENT_NAVIGATION_PUBLICATION_EPOCH_SUFFIX.repeat(2)

function staleNavigationEchoes(): void {
  const environments = window.api.runtimeEnvironments
  const subscribe = environments.subscribe.bind(environments)
  environments.subscribe = (args, callbacks) =>
    subscribe(args, {
      ...callbacks,
      onResponse: (response) => {
        const frame = response.ok ? (response.result as { publicationEpoch?: unknown } | null) : null
        const epoch = typeof frame?.publicationEpoch === 'string' ? frame.publicationEpoch : ''
        if (!response.ok || !epoch.endsWith(NAVIGATION_ECHO)) {
          callbacks.onResponse(response)
          return
        }
        const publicationEpoch = epoch.slice(0, -CLIENT_NAVIGATION_PUBLICATION_EPOCH_SUFFIX.length)
        callbacks.onResponse({ ...response, result: { ...frame, publicationEpoch, snapshotVersion: 0 } })
      }
    })
}

// Each step names itself on failure; the pairing input never enters a message.
async function step<T>(name: string, run: () => T | Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    throw new Error(`orca pane bootstrap: ${name} failed (${(error as Error)?.name ?? 'Error'})`)
  }
}

/** Once per document: session-only pairing, the web preload API, then the hidden services root. */
export function bootstrap(options: { pairing: string }): Promise<void> {
  booting ??= (async () => {
    await initWebDeviceKeySupport().catch(noop)
    const offer = await step('parseWebPairingInput', () => parseWebPairingInput(options.pairing))
    if (!offer || offer.scope !== 'runtime') {
      throw new Error('orca pane bootstrap: parseWebPairingInput failed (not a runtime pairing offer)')
    }
    const environment = await step('createStoredWebRuntimeEnvironment', () =>
      createStoredWebRuntimeEnvironment({
        name: 'Orca Server',
        offer,
        previousEnvironment: readStoredWebRuntimeEnvironment()
      })
    )
    // A6: session-only keeps the device token in page memory, never in localStorage.
    await step('saveStoredWebRuntimeEnvironment', () =>
      saveStoredWebRuntimeEnvironment({ ...environment, sessionOnly: true })
    )
    await step('installWebPreloadApi', () => installWebPreloadApi())
    staleNavigationEchoes()
    await step('services root', () => {
      const host = document.createElement('div')
      host.hidden = true
      host.setAttribute('data-pb-orca-services', '')
      document.body.appendChild(host)
      ReactDOMClient.createRoot(host, rootOptions('services')).render(
        <Providers>
          <Services />
          {/* A8: git-status polling and the editor watch (ActiveWorkspaceSyncGate is inside). */}
          <AppBackgroundServices />
          <PinnedTabCloseDialog />
          <RunningTerminalCloseDialog />
        </Providers>
      )
    })
    isBooted = true
  })()
  return booting
}

// ---------------------------------------------------------------- observation

function worktreeOf(state: State, worktreeId: string): { path: string; label: string } | null {
  for (const list of Object.values(state.worktreesByRepo ?? {})) {
    for (const worktree of list) {
      if (worktree.id === worktreeId) {
        return { path: worktree.path, label: worktree.displayName || worktree.path }
      }
    }
  }
  return null
}

function leavesOf(node: TerminalPaneLayoutNode | null | undefined): string[] {
  if (!node) return []
  return node.type === 'leaf' ? [node.leafId] : [...leavesOf(node.first), ...leavesOf(node.second)]
}

function groupLeavesOf(node: TabGroupLayoutNode | null | undefined): string[] {
  if (!node) return []
  return node.type === 'leaf' ? [node.groupId] : [...groupLeavesOf(node.first), ...groupLeavesOf(node.second)]
}

type LayoutNode = { type: 'leaf' } | { type: 'split'; direction: string; first: LayoutNode; second: LayoutNode }

/**
 * Neighbours of one leaf, nearest first: at each split above it, the other side's leaves, with
 * the mode saying where this leaf sits relative to them. `sideBySide` names the direction value
 * that lays children out in a row (terminal splits: 'vertical'; tab-group splits: 'horizontal').
 */
function neighboursIn(
  root: LayoutNode | null | undefined,
  target: string,
  leaves: (node: never) => string[],
  sideBySide: string
): Array<{ leaf: string; mode: NeighbourMode }> {
  const leavesOfNode = leaves as (node: LayoutNode) => string[]
  const path: Array<{ split: Extract<LayoutNode, { type: 'split' }>; side: 'first' | 'second' }> = []
  const find = (node: LayoutNode): boolean => {
    if (node.type === 'leaf') return leavesOfNode(node)[0] === target
    for (const side of ['first', 'second'] as const) {
      path.push({ split: node, side })
      if (find(node[side])) return true
      path.pop()
    }
    return false
  }
  if (!root || !find(root)) return []
  const out: Array<{ leaf: string; mode: NeighbourMode }> = []
  for (let i = path.length - 1; i >= 0; i -= 1) {
    const { split, side } = path[i]
    const row = split.direction === sideBySide
    const mode: NeighbourMode = row
      ? side === 'second' ? 'split-right' : 'split-left'
      : side === 'second' ? 'split-bottom' : 'split-top'
    for (const leaf of leavesOfNode(side === 'first' ? split.second : split.first)) out.push({ leaf, mode })
  }
  return out
}

function tabTitle(state: State, tab: Tab, generated: boolean): string {
  if (tab.contentType === 'agent-session') {
    return readStructuredChatTabName(tab as never, state)
  }
  if (tab.contentType === 'terminal') {
    const terminal = (state.tabsByWorktree[tab.worktreeId] ?? []).find((t) => t.id === tab.entityId)
    return resolveUnifiedTabLabel(
      {
        ...tab,
        customLabel: tab.customLabel ?? terminal?.customTitle ?? null,
        quickCommandLabel: tab.quickCommandLabel ?? terminal?.quickCommandLabel,
        generatedLabel: tab.generatedLabel ?? terminal?.generatedTitle
      },
      generated,
      tab.label
    )
  }
  return resolveUnifiedTabLabel(tab, generated, tab.label)
}

/** One record per pane of every content type in every worktree (C3, P64-13). */
function paneRecords(state: State): OrcaPaneRecord[] {
  const generated = state.settings?.tabAutoGenerateTitle === true
  const records: OrcaPaneRecord[] = []
  for (const [worktreeId, tabs] of Object.entries(state.unifiedTabsByWorktree ?? {})) {
    const worktree = worktreeOf(state, worktreeId)
    const groups = state.groupsByWorktree?.[worktreeId] ?? []
    const layout = state.layoutByWorktree?.[worktreeId] as TabGroupLayoutNode | undefined
    const keyOfTab = (tab: Tab): string => {
      if (tab.contentType === 'terminal') {
        const first = leavesOf(state.terminalLayoutsByTabId?.[tab.entityId]?.root)[0]
        return first ? makePaneKey(tab.entityId, first) : tab.entityId
      }
      return tab.id
    }
    const byId = new Map(tabs.map((tab) => [tab.id, tab]))
    // Tab-group neighbours of a tab: same group first (in tab order), then other groups by layout.
    const groupNeighbours = (tab: Tab): Array<{ key: string; mode: NeighbourMode }> => {
      const out: Array<{ key: string; mode: NeighbourMode }> = []
      const group = groups.find((g) => g.id === tab.groupId)
      if (group) {
        const order = group.tabOrder
        const at = order.indexOf(tab.id)
        const ranked = order
          .map((id, index) => ({ id, distance: Math.abs(index - at) }))
          .filter((entry) => entry.id !== tab.id)
          .sort((a, b) => a.distance - b.distance)
        for (const entry of ranked) {
          const other = byId.get(entry.id)
          if (other) out.push({ key: keyOfTab(other), mode: 'tab-after' })
        }
      }
      for (const { leaf, mode } of neighboursIn(layout as never, tab.groupId, groupLeavesOf, 'horizontal')) {
        const other = groups.find((g) => g.id === leaf)
        for (const id of other?.tabOrder ?? []) {
          const neighbour = byId.get(id)
          if (neighbour) out.push({ key: keyOfTab(neighbour), mode })
        }
      }
      return out
    }
    for (const tab of tabs) {
      const group = groups.find((g) => g.id === tab.groupId)
      const base = {
        kind: tab.contentType,
        worktreeId,
        worktreeLabel: worktree?.label ?? worktreeId,
        active: group?.activeTabId === tab.id,
        title: tabTitle(state, tab, generated)
      }
      if (tab.contentType === 'terminal') {
        const root = state.terminalLayoutsByTabId?.[tab.entityId]?.root
        const leaves = leavesOf(root)
        if (leaves.length === 0) {
          records.push({ ...base, key: tab.entityId, tabId: tab.entityId, paneKey: null, neighbours: groupNeighbours(tab) })
          continue
        }
        for (const leaf of leaves) {
          const paneKey = makePaneKey(tab.entityId, leaf)
          const inTab = neighboursIn(root as never, leaf, leavesOf, 'vertical').map(
            ({ leaf: other, mode }) => ({ key: makePaneKey(tab.entityId, other), mode })
          )
          records.push({ ...base, key: paneKey, tabId: tab.entityId, paneKey, neighbours: [...inTab, ...groupNeighbours(tab)] })
        }
        continue
      }
      const record: OrcaPaneRecord = { ...base, key: tab.id, tabId: tab.id, paneKey: null, neighbours: groupNeighbours(tab) }
      if (tab.contentType === 'browser') {
        const browserTab = (state.browserTabsByWorktree?.[worktreeId] ?? []).find((b) => b.id === tab.entityId)
        record.browserPageId = browserTab?.activePageId ?? null
      }
      records.push(record)
    }
  }
  return records
}

/** Calls `listener` with the full list now and after every store change that alters it. */
export function subscribePanes(listener: (panes: OrcaPaneRecord[]) => void): () => void {
  let last = paneRecords(useAppStore.getState())
  let lastText = JSON.stringify(last)
  listener(last)
  return useAppStore.subscribe((state, prior) => {
    if (
      state.unifiedTabsByWorktree === prior.unifiedTabsByWorktree &&
      state.groupsByWorktree === prior.groupsByWorktree &&
      state.layoutByWorktree === prior.layoutByWorktree &&
      state.tabsByWorktree === prior.tabsByWorktree &&
      state.terminalLayoutsByTabId === prior.terminalLayoutsByTabId &&
      state.browserTabsByWorktree === prior.browserTabsByWorktree &&
      state.worktreesByRepo === prior.worktreesByRepo &&
      state.settings === prior.settings
    ) {
      return
    }
    const next = paneRecords(state)
    const text = JSON.stringify(next)
    if (text !== lastText) {
      last = next
      lastText = text
      listener(last)
    }
  })
}

// ---------------------------------------------------------------- mounting

function unifiedTabFor(state: State, worktreeId: string, tabId: string): Tab | null {
  const tabs = state.unifiedTabsByWorktree?.[worktreeId] ?? []
  return tabs.find((tab) => tab.id === tabId) ?? tabs.find((tab) => tab.entityId === tabId) ?? null
}

/** Orca's own empty surface while the store has no such tab; nothing PB-authored. */
function Waiting(): React.JSX.Element {
  return <div className="h-full w-full bg-background" data-pb-orca-waiting="" />
}

function PaneBody({ pick }: { pick: PanePick }): React.JSX.Element {
  const { kind, worktreeId, tabId, paneKey } = pick
  const unified = useAppStore((state) => unifiedTabFor(state, worktreeId, tabId))
  const owner = useAppStore((state) =>
    structuredAgentSessionOwnerForTab(state, { worktreeId, executionHostId: unified?.executionHostId })
  )
  const worktreePath = useAppStore((state) => worktreeOf(state, worktreeId)?.path ?? '')
  const terminal = useAppStore((state) =>
    (state.tabsByWorktree[worktreeId] ?? []).find((t) => t.id === tabId) ?? null
  )
  if (kind === 'terminal') {
    if (!terminal || !worktreePath) return <Waiting />
    return (
      <TerminalPane
        key={`${tabId}-${terminal.generation ?? 0}`}
        tabId={tabId}
        worktreeId={worktreeId}
        cwd={terminal.startupCwd ?? worktreePath}
        isActive
        isVisible
        isWorktreeActive
        isolatedPaneKey={paneKey}
        onPtyExit={(ptyId) => closeTerminalTab(tabId, { reason: 'pty-exit', lifecyclePtyId: ptyId })}
        onCloseTab={() => closeTerminalTab(tabId)}
      />
    )
  }
  if (!unified) return <Waiting />
  if (kind === 'agent-session') {
    const target = structuredAgentSessionTargetForHost(owner)
    if (!target) return <Waiting />
    return (
      <NativeChatView
        mode="structured"
        tabId={unified.id}
        groupId={unified.groupId}
        sessionId={unified.entityId}
        agent={(unified.agentSessionAgent ?? 'claude') as never}
        isVisible
        isFocusedGroup
        target={target}
      />
    )
  }
  if (kind === 'simulator') {
    return <EmulatorPane tab={unified as never} worktreeId={worktreeId} isActive />
  }
  if (kind === 'conflict-review' || kind === 'check-details') {
    return (
      <EditorPanel
        activeFileId={unified.entityId}
        activeViewStateId={unified.entityId}
        isVisible
        isCmdSaveOwner
      />
    )
  }
  throw new Error(`orca pane: no hosted mount for content type ${kind}`)
}

let mountSequence = 0

/** A separate React root on the host React for one pane; returns the unmount. */
export function mountPane(element: HTMLElement, pick: PanePick): () => void {
  mountSequence += 1
  const root = ReactDOMClient.createRoot(element, rootOptions(pick.kind))
  root.render(
    <Providers>
      <div
        key={`pb-orca-pane-${mountSequence}`}
        data-pb-orca-pane-root={pick.kind}
        style={{ position: 'relative', display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: 0 }}
      >
        <PaneBody pick={pick} />
      </div>
    </Providers>
  )
  return () => root.unmount()
}

// ---------------------------------------------------------------- actions

/** Orca's own close with Orca's own confirmation (P64-11); never skips the running-process prompt. */
export function closePane(pick: { worktreeId: string; tabId: string; paneKey: string | null }): void {
  const state = useAppStore.getState()
  const tab = unifiedTabFor(state, pick.worktreeId, pick.tabId)
  if (!tab) return
  if (tab.contentType === 'terminal' && pick.paneKey) {
    const snapshot = state.terminalLayoutsByTabId?.[tab.entityId]
    const leaves = leavesOf(snapshot?.root)
    const leaf = pick.paneKey.slice(pick.paneKey.indexOf(':') + 1)
    if (leaves.length > 1 && leaves.includes(leaf)) {
      // Orca's split close acts on the active leaf of the mounted pane; make this leaf active first.
      state.setTabLayout?.(tab.entityId, { ...snapshot!, activeLeafId: leaf })
      requestActiveTerminalPaneClose(tab.entityId)
      return
    }
  }
  const groupTabs = (state.unifiedTabsByWorktree[pick.worktreeId] ?? []).filter((t) => t.groupId === tab.groupId)
  createWorkspaceTabCloseCommands({ worktreeId: pick.worktreeId, groupTabs }).closeItem(tab.id)
}

/** The host RPC the CLI uses (A4); the store mirrors the new tab. */
export async function createTerminal(worktreeId: string): Promise<void> {
  await callRuntimeResult('terminal.create', { worktree: `id:${worktreeId}` })
}

/** Orca's own structured chat launch (agentSession.create path); never falls back to a terminal. */
export async function createChat(worktreeId: string): Promise<void> {
  const agent = (useAppStore.getState().settings?.defaultTuiAgent ?? 'claude') as TuiAgent
  const plan = adoptAgentSessionLaunchVerdict({
    route: 'structured-native-chat',
    requestId: newAgentLaunchRequestId(),
    agent,
    worktreeId
  })
  const launch = beginStructuredAgentSessionProvisionalLaunch({
    plan,
    hooks: {},
    target: { worktreeId },
    declinedOpensCallerSurface: true,
    onHostDeclined: () => ({ opened: false })
  })
  if (!launch) {
    throw new Error('orca pane: the chat launch was refused')
  }
}

/** Orca's own openers; resolves the tab id. Used by checks. */
export async function openPane(
  kind: 'simulator' | 'conflict-review' | 'check-details',
  worktreeId: string,
  detail?: string
): Promise<string> {
  const state = useAppStore.getState()
  let entity: string | null = null
  if (kind === 'simulator') {
    entity = ensureSimulatorTab(worktreeId, { placement: 'activeGroup' })
  } else if (kind === 'conflict-review') {
    state.openConflictReview(
      worktreeId,
      worktreeOf(state, worktreeId)?.path ?? '',
      [{ path: detail ?? '', conflictKind: 'both_modified' }],
      'live-summary'
    )
    entity = `${worktreeId}::conflict-review`
  } else {
    state.openCheckRunDetails(
      worktreeId,
      detail ?? 'pb-orca-check',
      { name: detail ?? 'check', status: 'completed', conclusion: 'failure', url: null } as never,
      { requestId: 0, details: null, loading: false, error: null, githubRepository: null, gitlabProjectRef: null } as never
    )
    entity = useAppStore.getState().openFiles.find((file) => file.mode === 'check-details' && file.worktreeId === worktreeId)?.id ?? null
  }
  if (!entity) {
    throw new Error(`orca pane: ${kind} did not open`)
  }
  const tab = unifiedTabFor(useAppStore.getState(), worktreeId, entity)
  return tab?.id ?? entity
}

export function activeWorktree(): string | null {
  return useAppStore.getState().activeWorktreeId ?? null
}

/** The store's own selection action (the one Orca's sidebar activation ends in). */
export function setActiveWorktree(worktreeId: string): void {
  useAppStore.getState().setActiveWorktree(worktreeId)
}

/** What a check reads. No credential. */
export function state(): { booted: boolean; worktrees: number; panes: number; mountErrors: MountError[] } {
  const store = useAppStore.getState()
  return {
    booted: isBooted,
    worktrees: Object.values(store.worktreesByRepo ?? {}).flat().length,
    panes: paneRecords(store).length,
    mountErrors: mountErrors.map((error) => ({ ...error }))
  }
}
