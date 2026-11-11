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
import { orderEmptyQueryWorktrees } from '../lib/order-empty-query-worktrees'
import { initWebDeviceKeySupport } from '../web/web-device-key-support'
import { installWebPreloadApi } from '../web/web-preload-api'
import { readStoredWebRuntimeEnvironment } from '../web/web-runtime-environment'
import { callRuntimeResult } from '../web/preload-api/web-runtime-calls'
import { NativeChatResumeOnRestartModal } from '../components/NativeChatResumeRuntimeModal'
import { ModalBoundary, OverlayBoundary } from '../app-shell/app-root-surface-boundaries'
import { useLazyModalMounts } from '../app-shell/use-lazy-modal-mounts'
import { usePreloadWorktreeJumpPalette, WorktreeJumpPalette } from '../app-shell/worktree-jump-palette-preload'
import NewWorkspaceComposerModal from '../components/NewWorkspaceComposerModal'
import { lazyWithRetry } from '@/lib/lazy-with-retry'
import { detectLanguage } from '@/lib/language-detect'
import { toRuntimeWorktreeSelector } from '../runtime/runtime-worktree-selector'
import { discardStagedWebRuntimeBrowserTab, type StagedWebRuntimeBrowserTab } from '../runtime/web-runtime-browser-tab-staging'
import { buildBrowserPage, buildWorkspaceFromPage, findPage } from '../store/slices/browser-page-records'
import { browserTabOpenView } from '../store/slices/browser/browser-tab-open-view'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { toRuntimeExecutionHostId } from '../../../shared/execution-host'
import { makePaneKey } from '../../../shared/stable-pane-id'
import { CLIENT_NAVIGATION_PUBLICATION_EPOCH_SUFFIX } from '../../../shared/runtime-session-contracts'
import { resolveUnifiedTabLabel } from '../../../shared/tab-title-resolution'
import type { KeybindingActionId, KeybindingOverrides, TerminalShortcutPolicy } from '../../../shared/keybindings'
import type { Tab, TabGroupLayoutNode } from '../../../shared/tab-types'
import type { TerminalPaneLayoutNode } from '../../../shared/terminal-tab-types'
import type { TuiAgent } from '../../../shared/tui-agent'
import type { GitConflictKind } from '../../../shared/git-status-types'
import type { DiffSource } from '../../../shared/editor-tab-view-types'
import type {
  GitBranchChangeEntry,
  GitBranchCompareResult,
  GitCommitCompareResult
} from '../../../shared/git-diff-compare-types'
import { SIDE_MOUNT_KINDS, SIDE_MOUNTS_BUILD, SideMountBody } from './pb-side-mounts'
import { WORKSPACE_API_BUILD } from './pb-workspace-api'
import { SESSION_PAIRING_BUILD, assertSessionOnly, pairSessionOnly, pairingState, presetSessionOnly } from './pb-session-pairing'
import './browser-host/pb-browser-host-link'

// Phase 65 (C3-65): the observation API, the orchestration focus and repair, re-exported as named exports.
export {
  subscribeOpenFiles,
  subscribeWorktrees,
  subscribeActiveView,
  setActiveView,
  subscribeActiveWorktree,
  subscribeOrchestrationEnabled,
  viewTitle
} from './pb-workspace-api'
export { setOrchestrationFocus } from './pb-side-mounts'
export { repair } from './pb-session-pairing'

const ENTRY_MARKER = 'pb-overlay:src/renderer/src/pb/pb-pane-mount.tsx'

/** The marker literals of the entry, the Vite config and the scoping pass (orca-overlay-built reads them). */
export const PB_OVERLAY_BUILD: readonly string[] = Object.freeze([
  ENTRY_MARKER,
  ...SIDE_MOUNTS_BUILD,
  ...WORKSPACE_API_BUILD,
  ...SESSION_PAIRING_BUILD,
  ...(PB_CONFIG_MARKERS as readonly string[])
])

/** Phase 64's hosted kinds this file mounts itself (conflict-review opens in Theia's merge editor, P65-01). */
const PANE_KINDS = ['terminal', 'agent-session', 'simulator'] as const

/** Every kind mountPane accepts (B-1, C3-65); check-details is CheckRunDetailsPanel alone (pb-side-mounts). */
export const MOUNT_KINDS: readonly string[] = Object.freeze([...PANE_KINDS, ...SIDE_MOUNT_KINDS])

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

// D-18: the hosted surfaces' triggers only set activeModal; AppRootSurfaces hosts the dialogs. The services root hosts
// every AppRootSurfaces modal that a module of this bundle opens, lazily, in the same boundaries and under the same
// conditions (orca-pane-entry clause k derives that set and requires it here).
const AddRepoDialog = lazyWithRetry(() => import('../components/sidebar/AddRepoDialog'))
const NonGitFolderDialog = lazyWithRetry(() => import('../components/sidebar/NonGitFolderDialog'))
const AddProjectFromFolderDialog = lazyWithRetry(() => import('../components/sidebar/AddProjectFromFolderDialog'))
const ProjectAddedDialog = lazyWithRetry(() => import('../components/sidebar/ProjectAddedDialog'))
const AiVaultSessionHistoryDialog = lazyWithRetry(() => import('../components/right-sidebar/AiVaultSessionHistoryDialog'))
const NodeDistMirrorDialog = lazyWithRetry(() => import('../components/settings/advanced/network/NodeDistMirrorDialog'))
const DiagramViewerModal = lazyWithRetry(() => import('../components/editor/DiagramViewerModal'))
const QuickOpen = lazyWithRetry(() => import('../components/QuickOpen'))
const SetupGuideModal = lazyWithRetry(() => import('../components/setup-guide/SetupGuideModal'))
const FeatureWallModal = lazyWithRetry(() => import('../components/feature-wall/FeatureWallModal'))
const DeleteWorktreeDialog = lazyWithRetry(() => import('../components/sidebar/DeleteWorktreeDialog'))
const PreservedBranchBatchReviewModal = lazyWithRetry(() => import('../components/sidebar/PreservedBranchBatchReviewModal'))

/** AppRootSurfaces' modals that this bundle's surfaces open, unchanged. */
function RootDialogs(): React.JSX.Element {
  const { mountedLazyModalIds, shouldMountAddRepoDialog } = useLazyModalMounts()
  usePreloadWorktreeJumpPalette()
  const activeModal = useAppStore((state) => state.activeModal)
  return (
    <>
      {activeModal === 'new-workspace-composer' ? (
        <ModalBoundary boundaryId="modal.new-workspace-composer" resetKey>
          <NewWorkspaceComposerModal />
        </ModalBoundary>
      ) : null}
      <React.Suspense fallback={null}>
        {shouldMountAddRepoDialog ? (
          <ModalBoundary boundaryId="modal.add-repo" resetKey={activeModal === 'add-repo'}>
            <AddRepoDialog />
          </ModalBoundary>
        ) : null}
        {activeModal === 'confirm-non-git-folder' ? (
          <ModalBoundary boundaryId="modal.confirm-non-git-folder" resetKey>
            <NonGitFolderDialog />
          </ModalBoundary>
        ) : null}
        {activeModal === 'confirm-add-project-from-folder' ? (
          <ModalBoundary boundaryId="modal.confirm-add-project-from-folder" resetKey>
            <AddProjectFromFolderDialog />
          </ModalBoundary>
        ) : null}
        {activeModal === 'project-added' ? (
          <ModalBoundary boundaryId="modal.project-added" resetKey>
            <ProjectAddedDialog />
          </ModalBoundary>
        ) : null}
        {activeModal === 'agent-session-history' ? (
          <ModalBoundary boundaryId="modal.agent-session-history" resetKey>
            <AiVaultSessionHistoryDialog />
          </ModalBoundary>
        ) : null}
        {activeModal === 'node-dist-mirror' ? (
          <ModalBoundary boundaryId="modal.node-dist-mirror" resetKey>
            <NodeDistMirrorDialog />
          </ModalBoundary>
        ) : null}
        {activeModal === 'diagram-viewer' ? (
          <ModalBoundary boundaryId="modal.diagram-viewer" resetKey>
            <DiagramViewerModal />
          </ModalBoundary>
        ) : null}
      </React.Suspense>
      <React.Suspense fallback={null}>
        {mountedLazyModalIds.has('quick-open') ? (
          <ModalBoundary boundaryId="modal.quick-open" resetKey={activeModal === 'quick-open'}>
            <QuickOpen />
          </ModalBoundary>
        ) : null}
        {mountedLazyModalIds.has('worktree-palette') ? (
          <ModalBoundary boundaryId="modal.worktree-palette" resetKey={activeModal === 'worktree-palette'}>
            <WorktreeJumpPalette />
          </ModalBoundary>
        ) : null}
        {mountedLazyModalIds.has('setup-guide') ? (
          <ModalBoundary boundaryId="modal.setup-guide" resetKey={activeModal === 'setup-guide'}>
            <SetupGuideModal />
          </ModalBoundary>
        ) : null}
        {mountedLazyModalIds.has('feature-wall') ? (
          <ModalBoundary boundaryId="modal.feature-wall" resetKey={activeModal === 'feature-wall'}>
            <FeatureWallModal />
          </ModalBoundary>
        ) : null}
      </React.Suspense>
      <React.Suspense fallback={null}>
        {activeModal === 'delete-worktree' ? (
          <ModalBoundary boundaryId="modal.delete-worktree" resetKey>
            <DeleteWorktreeDialog />
          </ModalBoundary>
        ) : null}
        {activeModal === 'preserved-branch-review' ? (
          <ModalBoundary boundaryId="modal.preserved-branch-review" resetKey>
            <PreservedBranchBatchReviewModal />
          </ModalBoundary>
        ) : null}
      </React.Suspense>
    </>
  )
}

/** B-9 (P65-22, CA-14): Orca's resume offer inside its overlay boundary, as AppRootSurfaces.tsx mounts it. */
function ResumeOffer(): React.JSX.Element {
  const activeView = useAppStore((state) => state.activeView)
  return (
    <OverlayBoundary boundaryId="overlay.native-chat-resume-on-restart" resetKey={activeView}>
      <NativeChatResumeOnRestartModal />
    </OverlayBoundary>
  )
}

// D-32 (C13): hosted Orca terminals give their keys to the shell. 'terminal-first' is Orca's own escape hatch for
// shells and TUIs (it turns Orca's window shortcuts and its TUI-clashing terminal actions off in a terminal). It is set
// in this document's store only, never through Orca's settings actions, so orcad's persisted settings and every other
// client keep their own policy; it is re-applied whenever hydration or a host refresh replaces the settings object.
const HOSTED_TERMINAL_SHORTCUT_POLICY: TerminalShortcutPolicy = 'terminal-first'
// Still active under terminal-first, yet control characters a terminal program reads: Ctrl+[ (Escape) and Ctrl+] are
// Orca's split-pane focus keys. Released the same way (empty bindings in this store only; PowerBrowser splits panes).
const HOSTED_TERMINAL_RELEASED_ACTIONS: readonly KeybindingActionId[] = ['terminal.focusPreviousPane', 'terminal.focusNextPane']

function hostedTerminalKeysPatch(state: State): Partial<State> | null {
  const patch: Partial<State> = {}
  if (state.settings && state.settings.terminalShortcutPolicy !== HOSTED_TERMINAL_SHORTCUT_POLICY) {
    patch.settings = { ...state.settings, terminalShortcutPolicy: HOSTED_TERMINAL_SHORTCUT_POLICY }
  }
  if (HOSTED_TERMINAL_RELEASED_ACTIONS.some((id) => state.keybindings?.[id]?.length !== 0)) {
    const released: KeybindingOverrides = {}
    for (const id of HOSTED_TERMINAL_RELEASED_ACTIONS) released[id] = []
    patch.keybindings = { ...state.keybindings, ...released }
  }
  return Object.keys(patch).length ? patch : null
}

function hostedTerminalKeys(): void {
  const apply = (state: State): void => {
    const patch = hostedTerminalKeysPatch(state)
    if (patch) useAppStore.setState(patch)
  }
  apply(useAppStore.getState())
  useAppStore.subscribe((state) => apply(state))
}

// Each step names itself on failure; the pairing input never enters a message.
async function step<T>(name: string, run: () => T | Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    throw new Error(`orca pane bootstrap: ${name} failed (${(error as Error)?.name ?? 'Error'})`)
  }
}

/**
 * Once per document: session-only pairing (the offer read from orcad's web-client URL, C64-5), the web preload
 * API, then the hidden services root. Orca's device-key support is preset to session-no-ed25519 immediately
 * before Orca's own init (P65-17, Pitfall 6); nothing connects unless the pairing is session-only (CA-07).
 */
export function bootstrap(options: { pairing: string }): Promise<void> {
  booting ??= (async () => {
    presetSessionOnly()
    await initWebDeviceKeySupport().catch(noop)
    await step('pairing', () => pairSessionOnly(options.pairing))
    if (!assertSessionOnly()) throw new Error('session-only pairing unavailable')
    await step('installWebPreloadApi', () => installWebPreloadApi())
    staleNavigationEchoes()
    hostedTerminalKeys()
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
          <ResumeOffer />
          <RootDialogs />
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

function PaneBody({ pick }: { pick: PanePick }): React.JSX.Element | null {
  if (!MOUNT_KINDS.includes(pick.kind)) throw new Error(`orca pane: no hosted mount for content type ${pick.kind}`)
  if ((SIDE_MOUNT_KINDS as readonly string[]).includes(pick.kind)) {
    return <SideMountBody kind={pick.kind} worktreeId={pick.worktreeId} tabId={pick.tabId} />
  }
  return <HostedPaneBody pick={pick} />
}

function HostedPaneBody({ pick }: { pick: PanePick }): React.JSX.Element {
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
  throw new Error(`orca pane: no hosted mount for content type ${kind}`)
}

let mountSequence = 0

/** A separate React root on the host React for one pane; returns the unmount. A kind not in MOUNT_KINDS throws
 * inside the render naming the kind, so mountErrors records it (the standalone row's detector control). */
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

// D-34 (P66-09): PowerBrowser's browser host bypasses WebRuntimeClient, the only path that puts a browser page into this
// store, so each page whose web tab opened gets its row here, in the shape the web client's browser path stages a
// client-hosted page (stageWebRuntimeBrowserTab): a background row carrying the page id with a staged, client-hosted
// handle, exempt from snapshot culling and dropped by Orca's session restore (a reload leaves no duplicate). The
// records are the ones createBrowserTab draws; its own call is not used because its managed-browser gate refuses a
// paired web client whose runtime has no screencast, and orcad here has no engine (the page is PowerBrowser's).
const browserPageRows = new Map<string, StagedWebRuntimeBrowserTab>()

/** The row of a page the browser host opened (called by pb-browser-host.ts); false when one exists or no pairing. */
export function addBrowserPage(worktreeId: string, browserPageId: string): boolean {
  // The session-only pairing's environment (settings carry no active environment in this client).
  const environmentId = readStoredWebRuntimeEnvironment()?.id
  if (!environmentId || browserPageRows.has(browserPageId) || findPage(useAppStore.getState().browserPagesByWorkspace, browserPageId)) {
    return false
  }
  const workspaceId = createBrowserUuid()
  const page = buildBrowserPage(workspaceId, worktreeId, 'about:blank', undefined, environmentId, browserPageId)
  const workspace = buildWorkspaceFromPage(workspaceId, worktreeId, page, [page.id])
  useAppStore.setState((s) => ({
    browserTabsByWorktree: { ...s.browserTabsByWorktree, [worktreeId]: [...(s.browserTabsByWorktree[worktreeId] ?? []), workspace] },
    browserPagesByWorkspace: { ...s.browserPagesByWorkspace, [workspaceId]: [page] },
    ...browserTabOpenView(s, worktreeId, workspace, page, { activate: false })
  }))
  const state = useAppStore.getState()
  state.setRemoteBrowserPageHandle(page.id, { environmentId, remotePageId: browserPageId, staged: true, stagedClientHosted: true })
  state.createUnifiedTab(worktreeId, 'browser', {
    entityId: workspaceId,
    label: workspace.title,
    executionHostId: toRuntimeExecutionHostId(environmentId),
    activate: false
  })
  browserPageRows.set(browserPageId, { workspaceId, pageId: page.id, clientHosted: true })
  return true
}

/** Drops that row on closePage or a user close, with Orca's own discard (it sends no second browser.tabClose). */
export function removeBrowserPage(browserPageId: string): void {
  const staged = browserPageRows.get(browserPageId)
  browserPageRows.delete(browserPageId)
  if (staged) discardStagedWebRuntimeBrowserTab(staged)
}

/** Orca's own selection of a page's row (focusBrowserTabInWorktree, the store action a tab switch --focus ends in on
 * Orca's desktop). Used by checks only, never by a PowerBrowser command (P64-10): orcad's session snapshot lists no
 * client-hosted page, so no CLI switch reaches this store. */
export function selectBrowserPage(browserPageId: string): boolean {
  const state = useAppStore.getState()
  const page = findPage(state.browserPagesByWorkspace, browserPageId)
  if (!page) return false
  state.focusBrowserTabInWorktree(page.worktreeId, browserPageId)
  return true
}

type DiffDetail = { source: DiffSource; relativePath: string; oldPath?: string; commitOid?: string; baseRef?: string }

/** Branch- or commit-compare through the paired host's own git RPC (what Orca's source-control panel reads). */
async function compareFor(worktreeId: string, detail: DiffDetail): Promise<GitBranchCompareResult | GitCommitCompareResult> {
  const worktree = toRuntimeWorktreeSelector(worktreeId)
  if (detail.source === 'commit' || detail.source === 'combined-commit') {
    if (!detail.commitOid) throw new Error('orca pane: a commit diff needs commitOid')
    return callRuntimeResult<GitCommitCompareResult>('git.commitCompare', { worktree, commitId: detail.commitOid }, 15_000)
  }
  const baseRef = detail.baseRef ?? useAppStore.getState().gitBranchCompareSummaryByWorktree?.[worktreeId]?.baseRef
  if (!baseRef) throw new Error('orca pane: a branch diff needs baseRef')
  return callRuntimeResult<GitBranchCompareResult>('git.branchCompare', { worktree, baseRef, admissionTier: 'interactive' }, 15_000)
}

/** B-10: Orca's own diff opener for each source. */
async function openDiffPane(worktreeId: string, path: string, detail: DiffDetail): Promise<void> {
  const state = useAppStore.getState()
  const language = detectLanguage(detail.relativePath)
  const entryOf = (entries: GitBranchChangeEntry[]): GitBranchChangeEntry =>
    entries.find((e) => e.path === detail.relativePath) ?? { path: detail.relativePath, status: 'modified', ...(detail.oldPath ? { oldPath: detail.oldPath } : {}) }
  switch (detail.source) {
    case 'unstaged':
    case 'staged':
      state.openDiff(worktreeId, `${path}/${detail.relativePath}`, detail.relativePath, language, detail.source === 'staged', detail.oldPath ? { oldPath: detail.oldPath } : undefined)
      return
    case 'combined-all':
    case 'combined-uncommitted':
      state.openAllDiffs(worktreeId, path)
      return
    case 'branch': {
      const { summary, entries } = (await compareFor(worktreeId, detail)) as GitBranchCompareResult
      state.openBranchDiff(worktreeId, path, entryOf(entries), summary, language)
      return
    }
    case 'combined-branch': {
      const { summary } = (await compareFor(worktreeId, detail)) as GitBranchCompareResult
      state.openBranchAllDiffs(worktreeId, path, summary)
      return
    }
    case 'commit': {
      const { summary, entries } = (await compareFor(worktreeId, detail)) as GitCommitCompareResult
      state.openCommitDiff(worktreeId, path, entryOf(entries), summary, language)
      return
    }
    case 'combined-commit': {
      const { summary, entries } = (await compareFor(worktreeId, detail)) as GitCommitCompareResult
      state.openCommitAllDiffs(worktreeId, path, summary, entries)
      return
    }
  }
  throw new Error(`orca pane: unknown diff source ${String(detail.source)}`)
}

function parseDetail<T>(detail: string | undefined, what: string): T {
  try {
    return JSON.parse(detail ?? '') as T
  } catch {
    throw new Error(`orca pane: ${what} detail is not JSON`)
  }
}

/**
 * Orca's own openers; resolves the Orca tab id. Used by checks only, never by a PowerBrowser command (P64-10).
 * editor: detail is a repo-relative path. diff: detail is JSON { source, relativePath, oldPath?, commitOid?,
 * baseRef? } (baseRef defaults to the base of Orca's own branch compare). conflict-review: a plain path (recorded
 * both_modified, Phase 64) or JSON { relativePath, conflictKind }.
 */
export async function openPane(
  kind: 'simulator' | 'conflict-review' | 'check-details' | 'editor' | 'diff',
  worktreeId: string,
  detail?: string
): Promise<string> {
  const state = useAppStore.getState()
  const path = worktreeOf(state, worktreeId)?.path ?? ''
  const before = new Set(state.openFiles.map((file) => file.id))
  const newest = (match: (file: State['openFiles'][number]) => boolean): string | null => {
    const files = useAppStore.getState().openFiles.filter((file) => file.worktreeId === worktreeId && match(file))
    return (files.find((file) => !before.has(file.id)) ?? files.at(-1))?.id ?? null
  }
  let entity: string | null = null
  if (kind === 'simulator') {
    entity = ensureSimulatorTab(worktreeId, { placement: 'activeGroup' })
  } else if (kind === 'conflict-review') {
    const parsed = detail?.trim().startsWith('{')
      ? parseDetail<{ relativePath: string; conflictKind: GitConflictKind }>(detail, 'conflict-review')
      : { relativePath: detail ?? '', conflictKind: 'both_modified' as GitConflictKind }
    state.openConflictReview(worktreeId, path, [{ path: parsed.relativePath, conflictKind: parsed.conflictKind }], 'live-summary')
    entity = `${worktreeId}::conflict-review`
  } else if (kind === 'editor') {
    const relativePath = detail ?? ''
    entity = state.openFile({ filePath: `${path}/${relativePath}`, relativePath, worktreeId, language: detectLanguage(relativePath), mode: 'edit' })
  } else if (kind === 'diff') {
    const parsed = parseDetail<DiffDetail>(detail, 'diff')
    await openDiffPane(worktreeId, path, parsed)
    entity = newest((file) => file.mode === 'diff' && file.diffSource === parsed.source)
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

export type OrcaWorktree = { id: string; label: string; path: string }

/** C3': what a check and the Orca commands read. No credential. worktrees is every worktree in Orca's store, in Orca's
 * own empty-query order (visited first by recency, then activity, then display label), as its worktree palette lists them. */
export function state(): {
  booted: boolean
  worktrees: OrcaWorktree[]
  panes: number
  mountErrors: MountError[]
  pairing: { sessionOnly: boolean; deviceKeySupport: string | null }
} {
  const store = useAppStore.getState()
  const { switchableWorktreesForRows } = orderEmptyQueryWorktrees({
    visibleWorktrees: Object.values(store.worktreesByRepo ?? {}).flat(),
    activeWorktreeId: null,
    lastVisitedAtByWorktreeId: store.lastVisitedAtByWorktreeId ?? {}
  })
  return {
    booted: isBooted,
    worktrees: switchableWorktreesForRows.map((w) => ({ id: w.id, label: w.displayName || w.path, path: w.path })),
    panes: paneRecords(store).length,
    mountErrors: mountErrors.map((error) => ({ ...error })),
    pairing: pairingState()
  }
}
