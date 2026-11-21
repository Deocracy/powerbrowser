// PowerBrowser overlay file (Phase 65, TAB-05, TAB-07, TAB-08; P65-02, P65-05, P65-10, P65-11, P65-12, P65-26,
// CA-03, CA-11, CA-12): the read-only observation API of Orca's store that the Theia lanes consume (interfaces
// B-2..B-7 of 65-01-PLAN.md), re-exported by the pane entry. scripts/build-orca.sh copies it to
// orca/src/renderer/src/pb/. Every subscription calls back once on subscribe and then only when its
// projection changes; nothing here writes Orca's store except setActiveView and setRightSidebarOpen, which call
// Orca's own actions. No field carries file contents, a pairing offer or a token.
import { translate } from '@/i18n/i18n'
import { useAppStore } from '../store'
import { readStoredWebRuntimeEnvironment } from '../web/web-runtime-environment'
import { LOCAL_EXECUTION_HOST_ID, toRuntimeExecutionHostId } from '../../../shared/execution-host'
import { getFolderWorkspaceWorktree } from '../../../shared/folder-workspace-worktree'
import {
  createRepoRowExecutionHostLookup,
  resolveWorktreeExecutionHost
} from '../../../shared/worktree-execution-host-resolution'
import type { OpenFile } from '../store/slices/editor/types/open-file'
import type { TopLevelView } from '../../../shared/ui-chrome-types'

const WORKSPACE_API_MARKER = 'pb-overlay:src/renderer/src/pb/pb-workspace-api.ts'

/** This file's marker literal (orca-overlay-built reads it through the entry's PB_OVERLAY_BUILD). */
export const WORKSPACE_API_BUILD: readonly string[] = Object.freeze([WORKSPACE_API_MARKER])

type State = ReturnType<typeof useAppStore.getState>

/** Calls back with project(state) now and whenever its JSON text changes. */
function subscribeProjection<T>(project: (state: State) => T, cb: (value: T) => void): () => void {
  let last = JSON.stringify(project(useAppStore.getState()))
  cb(JSON.parse(last) as T)
  return useAppStore.subscribe((state) => {
    const text = JSON.stringify(project(state))
    if (text !== last) {
      last = text
      cb(JSON.parse(text) as T)
    }
  })
}

// ---------------------------------------------------------------- CA-12: the local predicate

/** The paired environment's id, read from the session-only pairing this document holds. */
function pairedEnvironmentId(): string | null {
  return readStoredWebRuntimeEnvironment()?.id ?? null
}

function ownerIsPaired(environmentId: string | null | undefined, paired: string | null): boolean {
  return !environmentId || environmentId === paired
}

/** A resolved execution host this document may read from its own disk: Orca's local host or the paired runtime's. */
function hostIsPaired(hostId: string, paired: string | null): boolean {
  return hostId === LOCAL_EXECUTION_HOST_ID || (paired !== null && hostId === toRuntimeExecutionHostId(paired))
}

type WorktreeRecord = { id: string; repoId: string; path: string; isArchived: boolean; hostId?: string; runtimeOwnerEnvironmentId?: string }

function worktreeRecords(state: State): WorktreeRecord[] {
  return Object.values(state.worktreesByRepo ?? {}).flat() as WorktreeRecord[]
}

/** Git worktrees and Orca's synthetic rows for folder workspaces (which live in folderWorkspaces, not worktreesByRepo). */
function allWorktreeRecords(state: State): WorktreeRecord[] {
  return [...worktreeRecords(state), ...(state.folderWorkspaces ?? []).map((f) => getFolderWorkspaceWorktree(f) as WorktreeRecord)]
}

// Audit 65-WR-01: Orca's own rule (worktree-execution-host-resolution.ts): unresolved ownership never authorizes a local
// read of a remote path. An unknown worktree is not local; a host-less worktree takes its repo row's host, as Orca does.
function worktreeIsLocal(
  worktree: WorktreeRecord | undefined,
  lookup: ReturnType<typeof createRepoRowExecutionHostLookup>,
  paired: string | null
): boolean {
  if (!worktree) return false
  if (!ownerIsPaired(worktree.runtimeOwnerEnvironmentId, paired)) return false
  const host = resolveWorktreeExecutionHost(lookup, worktree)
  return host.kind === 'resolved' && hostIsPaired(host.hostId, paired)
}

// ---------------------------------------------------------------- B-2 open files

export type OrcaOpenFile = {
  id: string
  tabId: string
  worktreeId: string
  worktreePath: string
  filePath: string
  relativePath: string
  mode: OpenFile['mode']
  diffSource?: string
  isPreview: boolean
  active: boolean
  local: boolean
  oldPath?: string
  branch?: { mergeBase: string | null; headOid: string | null }
  commit?: { parentOid: string | null; commitOid: string | null }
  combinedFirst?: { relativePath: string; oldPath?: string; area?: string }
  conflicts?: { selectedPath?: string; entries: Array<{ relativePath: string; conflictKind: string }> }
}

const OBJECT_ID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/

function objectId(value: string | null | undefined): string | null {
  return typeof value === 'string' && OBJECT_ID.test(value) ? value : null
}

function combinedFirstOf(file: OpenFile): OrcaOpenFile['combinedFirst'] {
  const source = file.diffSource
  if (!source?.startsWith('combined-')) return undefined
  if (source === 'combined-branch') {
    const entry = file.branchEntriesSnapshot?.[0]
    return entry ? { relativePath: entry.path, ...(entry.oldPath ? { oldPath: entry.oldPath } : {}) } : undefined
  }
  if (source === 'combined-commit') {
    const entry = file.commitEntriesSnapshot?.[0]
    return entry ? { relativePath: entry.path, ...(entry.oldPath ? { oldPath: entry.oldPath } : {}) } : undefined
  }
  const entry = file.uncommittedEntriesSnapshot?.[0]
  return entry
    ? { relativePath: entry.path, ...(entry.oldPath ? { oldPath: entry.oldPath } : {}), ...(entry.area ? { area: entry.area } : {}) }
    : undefined
}

function openFileRecords(state: State): OrcaOpenFile[] {
  const paired = pairedEnvironmentId()
  const lookup = createRepoRowExecutionHostLookup(state.repos ?? [])
  const worktrees = new Map(allWorktreeRecords(state).map((w) => [w.id, w]))
  return (state.openFiles ?? []).map((file) => {
    const worktree = worktrees.get(file.worktreeId)
    const tab = (state.unifiedTabsByWorktree?.[file.worktreeId] ?? []).find((t) => t.entityId === file.id)
    const record: OrcaOpenFile = {
      id: file.id,
      tabId: tab?.id ?? file.id,
      worktreeId: file.worktreeId,
      worktreePath: worktree?.path ?? '',
      filePath: file.filePath,
      relativePath: file.relativePath,
      mode: file.mode,
      isPreview: file.isPreview === true,
      active: state.activeFileIdByWorktree?.[file.worktreeId] === file.id,
      local: !file.externalSshTargetId && ownerIsPaired(file.runtimeEnvironmentId, paired) && worktreeIsLocal(worktree, lookup, paired)
    }
    if (file.diffSource) record.diffSource = file.diffSource
    if (file.branchOldPath) record.oldPath = file.branchOldPath
    if (file.branchCompare) {
      record.branch = { mergeBase: objectId(file.branchCompare.mergeBase), headOid: objectId(file.branchCompare.headOid) }
    }
    if (file.commitCompare) {
      record.commit = { parentOid: objectId(file.commitCompare.parentOid), commitOid: objectId(file.commitCompare.commitOid) }
    }
    const first = combinedFirstOf(file)
    if (first) record.combinedFirst = first
    if (file.mode === 'conflict-review' && file.conflictReview) {
      const selected = file.conflictReview.selectedFileId
        ? state.openFiles.find((f) => f.id === file.conflictReview?.selectedFileId)?.relativePath
        : undefined
      record.conflicts = {
        ...(selected ? { selectedPath: selected } : {}),
        entries: file.conflictReview.entries.map((e) => ({ relativePath: e.path, conflictKind: e.conflictKind }))
      }
    }
    return record
  })
}

/** B-2: every editor-type Orca tab of every worktree. */
export function subscribeOpenFiles(cb: (files: OrcaOpenFile[]) => void): () => void {
  return subscribeProjection(openFileRecords, cb)
}

// ---------------------------------------------------------------- B-3..B-6

export type OrcaWorkspaces = {
  worktrees: Array<{ id: string; path: string; isArchived: boolean; local: boolean }>
  folders: Array<{ id: string; path: string; local: boolean }>
}

/** B-3: Orca's worktrees and folder workspaces with the CA-12 predicate. */
export function subscribeWorktrees(cb: (workspaces: OrcaWorkspaces) => void): () => void {
  return subscribeProjection((state) => {
    const paired = pairedEnvironmentId()
    const lookup = createRepoRowExecutionHostLookup(state.repos ?? [])
    return {
      worktrees: worktreeRecords(state).map((w) => ({ id: w.id, path: w.path, isArchived: w.isArchived === true, local: worktreeIsLocal(w, lookup, paired) })),
      folders: (state.folderWorkspaces ?? []).map((f) => ({
        id: f.id,
        path: f.folderPath,
        local: !f.connectionId && worktreeIsLocal(getFolderWorkspaceWorktree(f) as WorktreeRecord, lookup, paired)
      }))
    }
  }, cb)
}

/** B-4: the active TopLevelView and whether a worktree creation is pending (CA-11). */
export function subscribeActiveView(cb: (view: { view: TopLevelView; pendingCreation: boolean }) => void): () => void {
  return subscribeProjection(
    (state) => ({ view: state.activeView, pendingCreation: state.activePendingCreationId !== null }),
    cb
  )
}

/** B-4: Orca's own activeView action (P65-10). */
export function setActiveView(view: TopLevelView): void {
  useAppStore.getState().setActiveView(view)
}

/** B-5: the store's active worktree id. */
export function subscribeActiveWorktree(cb: (worktreeId: string | null) => void): () => void {
  return subscribeProjection((state) => state.activeWorktreeId ?? null, cb)
}

/** B-6: the setting use-orchestration-panel-enabled reads. */
export function subscribeOrchestrationEnabled(cb: (enabled: boolean) => void): () => void {
  return subscribeProjection((state) => state.settings?.experimentalOrchestrationPanel === true, cb)
}

// ---------------------------------------------------------------- B-8 (debug orca-mode-fresh-profile-look, 2026-11-18)

/**
 * B-8: Orca's right-sidebar open flag, the value its close button and RightSidebarToggle flip (toggleRightSidebar);
 * null until Orca has hydrated its persisted UI (persistedUIReady), which replaces the store's default with the saved value.
 */
export function subscribeRightSidebarOpen(cb: (open: boolean | null) => void): () => void {
  return subscribeProjection((state) => (state.persistedUIReady ? state.rightSidebarOpen === true : null), cb)
}

/** B-8: Orca's own setRightSidebarOpen action; the Theia right panel hosting RightSidebar opened or closed. */
export function setRightSidebarOpen(open: boolean): void {
  useAppStore.getState().setRightSidebarOpen(open)
}

// ---------------------------------------------------------------- B-7

// Orca's own label for each surface where Orca names it (its sidebar header, nav and menus); '' where it has none.
const TITLES: Record<string, () => string> = {
  sidebar: () => translate('dashboard.sidebar.workspaces', 'Workspaces'),
  settings: () => translate('auto.components.sidebar.SidebarSettingsHelpMenu.a428c25998', 'Settings'),
  orchestration: () => translate('components.orchestrationCrew.title', 'Orchestration'),
  'page:tasks': () => translate('auto.components.sidebar.SidebarNav.fee535205b', 'Tasks'),
  'page:automations': () => translate('auto.components.sidebar.SidebarNav.f323383e9a', 'Automations'),
  'page:skills': () => translate('auto.components.sidebar.SidebarNav.skills', 'Skills'),
  'page:artifacts': () => translate('auto.components.sidebar.SidebarNav.artifacts', 'Artifacts'),
  'page:mobile': () => translate('auto.components.sidebar.SidebarNav.1b5c41caee', 'Orca Mobile')
}

/** B-7: Orca's translated title for a side or page kind; '' when Orca has none (right-sidebar, activity, space, creation). */
export function viewTitle(kind: string): string {
  return TITLES[kind]?.() ?? ''
}
