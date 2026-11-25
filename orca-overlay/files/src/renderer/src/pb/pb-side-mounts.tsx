// PowerBrowser overlay file (Phase 65, TAB-05, TAB-07, TAB-08; P65-01, P65-04, P65-12, P65-13, CA-11, D-01):
// the mount kinds Phase 65 adds to the pane entry (pb-pane-mount.tsx). scripts/build-orca.sh copies it to
// orca/src/renderer/src/pb/. Each surface is mounted the way Orca's own shell mounts it
// (app-shell/AppWorkspaceShell.tsx: WorktreeSidebar, ActivePage, PendingCreationSurface, the right
// sidebar's boundary; components/editor/EditorContent.tsx's check-details branch), unchanged: no section
// hidden, no copy rewritten (P65-13). check-details mounts CheckRunDetailsPanel alone, never Orca's
// editor (D-01). right-sidebar-toggle (debug orca-mode-fresh-profile-look, 2026-11-18) is Orca's own
// RightSidebarToggle, which AppWorkspaceShell shows at the workspace area's top right while the right
// sidebar is closed. Nothing here writes Orca's store; the toggle calls Orca's own toggleRightSidebar.
import * as React from 'react'
import { Suspense, useRef, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { lazyWithRetry as lazy } from '@/lib/lazy-with-retry'
import { translate } from '@/i18n/i18n'
import { pendingCreationOpensNativeChat } from '@/lib/pending-worktree-creation'
import { useAppStore } from '../store'
import Sidebar from '../components/Sidebar'
import RightSidebar from '../components/right-sidebar'
import { RightSidebarToggle } from '../app-shell/TitlebarMainStrip'
import { RecoverableRenderErrorBoundary } from '../components/error-boundaries/RecoverableRenderErrorBoundary'
import { CheckRunDetailsPanel } from '../components/editor/CheckRunDetailsPanel'
import { NativeChatCrewPanel } from '../components/orchestration-crew/NativeChatCrewPanel'
import { LazyOrchestrationCrewPanel } from '../components/orchestration-crew/LazyOrchestrationCrewPanel'
import { useOrchestrationPanelEnabled } from '../components/orchestration-crew/use-orchestration-panel-enabled'
import { useTerminalCrewIdentity } from '../components/orchestration-crew/use-terminal-crew-identity'
import type { NativeChatComposerHandle } from '../components/native-chat/native-chat-composer-types'
import type { VirtualizedScrollAnchor } from '../hooks/useVirtualizedScrollAnchor'
import {
  structuredAgentSessionOwnerForTab,
  structuredAgentSessionTargetForHost
} from '../runtime/structured-agent-session-owner'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import type { TopLevelView } from '../../../shared/ui-chrome-types'

const SIDE_MOUNTS_MARKER = 'pb-overlay:src/renderer/src/pb/pb-side-mounts.tsx'

/** This file's marker literal (orca-overlay-built reads it from the built output through PB_OVERLAY_BUILD). */
export const SIDE_MOUNTS_BUILD: readonly string[] = Object.freeze([SIDE_MOUNTS_MARKER])

// The pages, lazily loaded as AppWorkspaceShell loads them.
const Settings = lazy(() => import('../components/settings/Settings'))
const TaskPage = lazy(() => import('../components/task-page/TaskPage'))
const ActivityPrototypePage = lazy(() => import('../components/activity/ActivityPrototypePage'))
const AutomationsPage = lazy(() => import('../components/automations/AutomationsPage'))
const WorkspaceSpacePage = lazy(() => import('../components/workspace-space/WorkspaceSpacePage'))
const SkillsPage = lazy(() => import('../components/skills/SkillsPage'))
const ArtifactsPage = lazy(() => import('../components/artifacts/ArtifactsPage'))
const MobilePage = lazy(() => import('../components/mobile/MobilePage'))
const WorktreeCreationPanel = lazy(() => import('../components/worktree-creation/WorktreeCreationPanel'))
const PendingNativeChatCreation = lazy(() => import('../components/worktree-creation/PendingNativeChatCreation'))

/** Each page kind and the TopLevelView whose ActivePage branch it mounts. */
export const PAGE_VIEWS: Readonly<Record<string, TopLevelView>> = Object.freeze({
  'page:tasks': 'tasks',
  'page:activity': 'activity',
  'page:automations': 'automations',
  'page:space': 'space',
  'page:skills': 'skills',
  'page:artifacts': 'artifacts',
  'page:mobile': 'mobile',
  'page:settings': 'settings'
})

const PAGES: Readonly<Record<string, React.ComponentType>> = {
  settings: Settings,
  tasks: TaskPage,
  activity: ActivityPrototypePage,
  automations: AutomationsPage,
  space: WorkspaceSpacePage,
  skills: SkillsPage,
  artifacts: ArtifactsPage,
  mobile: MobilePage
}

/** The kinds this file mounts (B-1, C3-65). */
export const SIDE_MOUNT_KINDS: readonly string[] = Object.freeze([
  'sidebar',
  'orchestration',
  'right-sidebar',
  'right-sidebar-toggle',
  'check-details',
  ...Object.keys(PAGE_VIEWS),
  'page:creation'
])

// ---------------------------------------------------------------- orchestration focus (B-6)

export type OrchestrationFocus = { worktreeId: string; tabId: string; paneKey?: string | null } | null

let focus: OrchestrationFocus = null
const focusListeners = new Set<() => void>()

/** Bundle-local: which chat or terminal leaf the orchestration mount follows; null shows nothing. */
export function setOrchestrationFocus(next: OrchestrationFocus): void {
  focus = next ? { worktreeId: next.worktreeId, tabId: next.tabId, paneKey: next.paneKey ?? null } : null
  for (const listener of focusListeners) listener()
}

function useOrchestrationFocus(): OrchestrationFocus {
  return useSyncExternalStore(
    (listener) => {
      focusListeners.add(listener)
      return () => focusListeners.delete(listener)
    },
    () => focus
  )
}

// ---------------------------------------------------------------- surfaces

/** AppWorkspaceShell's WorktreeSidebar: the boundary and the two scroll refs, as Orca creates them. */
function SidebarMount(): React.JSX.Element {
  const activeView = useAppStore((s) => s.activeView)
  const scrollOffsetRef = useRef(0)
  const scrollAnchorRef = useRef<VirtualizedScrollAnchor>(null)
  return (
    <RecoverableRenderErrorBoundary
      boundaryId="sidebar.worktrees"
      surface="sidebar"
      resetKey={activeView}
      title={translate('auto.App.1468601e7b', 'The workspace list hit an error.')}
      description={translate(
        'auto.App.bdc71dddc9',
        'The active workspace remains open. Retry the list or switch views.'
      )}
    >
      <Sidebar worktreeScrollOffsetRef={scrollOffsetRef} worktreeScrollAnchorRef={scrollAnchorRef} />
    </RecoverableRenderErrorBoundary>
  )
}

/** AppWorkspaceShell's right-sidebar boundary around RightSidebar. */
function RightSidebarMount(): React.JSX.Element {
  const resetKey = useAppStore((s) =>
    s.rightSidebarTab === 'explorer' ? `${s.rightSidebarTab}:${s.rightSidebarExplorerView}` : s.rightSidebarTab
  )
  return (
    <RecoverableRenderErrorBoundary
      boundaryId="right-sidebar"
      surface="right-sidebar"
      resetKey={resetKey}
      title={translate('auto.App.ed6b168d00', 'The right sidebar hit an error.')}
      description={translate('auto.App.8d1e160ed1', 'Retry the sidebar or switch tabs to reload this surface.')}
    >
      <RightSidebar />
    </RecoverableRenderErrorBoundary>
  )
}

/** ActivePage's page boundary (boundaryId page.<view>) around one page. */
function PageBoundary({ view, children }: { view: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <Suspense fallback={null}>
      <RecoverableRenderErrorBoundary
        boundaryId={`page.${view}`}
        surface="page"
        resetKey={view}
        title={translate('auto.App.b7a714db1e', 'This page hit an error.')}
        description={translate('auto.App.03a14f6b5b', 'Retry the page or navigate to another Orca surface.')}
      >
        {children}
      </RecoverableRenderErrorBoundary>
    </Suspense>
  )
}

/** ActivePage's PendingCreationSurface for the store's active pending creation; nothing when none (CA-11). */
function CreationMount(): React.JSX.Element | null {
  const creationId = useAppStore((s) =>
    s.activePendingCreationId !== null && s.pendingWorktreeCreations[s.activePendingCreationId] !== undefined
      ? s.activePendingCreationId
      : null
  )
  const opensChat = useAppStore((s) => {
    const entry = creationId ? s.pendingWorktreeCreations[creationId] : undefined
    return entry ? pendingCreationOpensNativeChat(entry) : false
  })
  if (!creationId) return null
  return (
    <PageBoundary view="terminal">
      {opensChat ? (
        <PendingNativeChatCreation creationId={creationId} reserveCollapsedSidebarHeaderSpace={false} />
      ) : (
        <WorktreeCreationPanel creationId={creationId} reserveCollapsedSidebarHeaderSpace={false} />
      )}
    </PageBoundary>
  )
}

/** EditorContent's check-details branch: CheckRunDetailsPanel with the props EditorContent passes. */
function CheckDetailsMount({ worktreeId, tabId }: { worktreeId: string; tabId: string }): React.JSX.Element {
  const file = useAppStore((s) => {
    const tabs = s.unifiedTabsByWorktree?.[worktreeId] ?? []
    const tab = tabs.find((t) => t.id === tabId) ?? tabs.find((t) => t.entityId === tabId)
    const id = tab?.entityId ?? tabId
    return s.openFiles.find((f) => f.id === id && f.mode === 'check-details') ?? null
  })
  const reloadOpenCheckRunDetailsTab = useAppStore((s) => s.reloadOpenCheckRunDetailsTab)
  if (!file) return <div className="h-full w-full bg-background" data-pb-orca-waiting="" />
  const checkRunDetails = file.checkRunDetails
  if (!checkRunDetails) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {translate('auto.components.editor.EditorContent.6c4f1a8d2e', 'Check details are unavailable.')}
      </div>
    )
  }
  const details = checkRunDetails.details
  return (
    <CheckRunDetailsPanel
      key={JSON.stringify([file.id, file.id, checkRunDetails.contextKey])}
      tabId={file.id}
      viewStateScopeId={file.id}
      contextKey={checkRunDetails.contextKey}
      check={checkRunDetails.check}
      details={details}
      loading={checkRunDetails.loading}
      error={checkRunDetails.error}
      openUrl={details?.detailsUrl ?? details?.url ?? checkRunDetails.check.url}
      worktreeId={file.worktreeId}
      onRefresh={() => {
        void reloadOpenCheckRunDetailsTab(file.id)
      }}
    />
  )
}

/**
 * A chat's crew panel, as NativeChatStructuredSession mounts it. Orca's rule: a mention needs the chat's
 * composer shown; the composer lives in the chat's own mount, never this one, so it is never shown here.
 */
function ChatCrew({ worktreeId, tabId }: { worktreeId: string; tabId: string }): React.JSX.Element | null {
  const tab = useAppStore((s) => {
    const tabs = s.unifiedTabsByWorktree?.[worktreeId] ?? []
    return tabs.find((t) => t.id === tabId) ?? tabs.find((t) => t.entityId === tabId) ?? null
  })
  const owner = useAppStore((s) =>
    structuredAgentSessionOwnerForTab(s, { worktreeId, executionHostId: tab?.executionHostId })
  )
  const composerRef = useRef<NativeChatComposerHandle | null>(null)
  if (!tab || tab.contentType !== 'agent-session') return null
  return (
    <NativeChatCrewPanel
      target={structuredAgentSessionTargetForHost(owner)}
      sessionId={tab.entityId}
      composerRef={composerRef}
      canMention={false}
    />
  )
}

/**
 * A terminal leaf's crew panel through useTerminalCrewIdentity, as TerminalCrewPortals mounts it. Orca's
 * rule: canMention is always on and the mention is rejected with Orca's own toast when no terminal
 * transport is captured; this mount holds no transport, so every mention takes that path.
 */
function TerminalCrew({ worktreeId, paneKey }: { worktreeId: string; paneKey: string }): React.JSX.Element | null {
  const pane = parsePaneKey(paneKey)
  const ptyId = useAppStore((s) =>
    pane ? (s.terminalLayoutsByTabId[pane.tabId]?.ptyIdsByLeafId?.[pane.leafId] ?? null) : null
  )
  const { target, party } = useTerminalCrewIdentity(paneKey, ptyId, worktreeId)
  if (!target || !party) return null
  return (
    <LazyOrchestrationCrewPanel
      target={target}
      party={party}
      surface="terminal"
      canMention
      mention={() => {
        toast.error(
          translate(
            'components.orchestrationCrew.mentionRejected',
            'The terminal did not accept the agent reference. Try again.'
          )
        )
      }}
    />
  )
}

/** The orchestration panel for the focus setOrchestrationFocus sets; mounted only while Orca's setting is on. */
function OrchestrationMount(): React.JSX.Element | null {
  const enabled = useOrchestrationPanelEnabled()
  const current = useOrchestrationFocus()
  if (!enabled || !current) return null
  return current.paneKey ? (
    <TerminalCrew key={current.paneKey} worktreeId={current.worktreeId} paneKey={current.paneKey} />
  ) : (
    <ChatCrew key={current.tabId} worktreeId={current.worktreeId} tabId={current.tabId} />
  )
}

/** The body of one Phase 65 kind; the entry wraps it in its providers and its pane-root div. */
export function SideMountBody({ kind, worktreeId, tabId }: { kind: string; worktreeId: string; tabId: string }): React.JSX.Element | null {
  if (kind === 'sidebar') return <SidebarMount />
  if (kind === 'right-sidebar') return <RightSidebarMount />
  if (kind === 'right-sidebar-toggle') return <RightSidebarToggle />
  if (kind === 'orchestration') return <OrchestrationMount />
  if (kind === 'check-details') return <CheckDetailsMount worktreeId={worktreeId} tabId={tabId} />
  if (kind === 'page:creation') return <CreationMount />
  const view = PAGE_VIEWS[kind]
  const Page = view ? PAGES[view] : undefined
  if (!view || !Page) throw new Error(`orca pane: no side mount for kind ${kind}`)
  return (
    <PageBoundary view={view}>
      <Page />
    </PageBoundary>
  )
}
