// PowerBrowser overlay file (Phase 66, BRW-03; P66-02, P66-03, A3, A7, A9; marker
// pb-overlay:src/renderer/src/pb/browser-host/pb-browser-host.ts): the thin browser host. scripts/build-orca.sh
// copies it to orca/src/renderer/src/pb/browser-host/ and scripts/build-orca-browser-host.sh compiles it with Orca's
// own Vite (vite.pb-browser-host.config.ts) into pb-browser-host.js beside the pane bundle, where the Theia backend
// serves it; orcad's port never does.
//
// A PB-owned client over Orca's shared and web pairing modules, never over WebRuntimeClient (condition 1 of spike
// 005): one WebSocket carries status.get, the browser.clientHost.attach subscription, every commandResult, every
// pageMetadata and every browser.tabClose. A token credential uses legacy framing with the browser-host capabilities
// through sealAuth's option; a device-key credential uses framing v2 with transport 'direct' and the same
// capabilities (v2 token auth would send none). The browser answers WebSocket pings itself, so no heartbeat is
// written. Nothing here logs; a failure is a short code, never pairing material.
import { createPairedE2EEClientHandshake } from '../../../../shared/paired-e2ee-client-handshake'
import type { PairedRuntimeConnection } from '../../../../shared/paired-runtime-connection'
import {
  BROWSER_CLIENT_HOST_RUNTIME_CAPABILITY,
  BROWSER_CLIENT_PAGE_METADATA_RUNTIME_CAPABILITY
} from '../../../../shared/browser-runtime-capabilities'
import { BROWSER_CLIENT_AUTOMATION_HOST_CAPABILITY } from '../../../../shared/browser-client-automation-protocol'
import {
  BrowserClientHostEvent,
  type BrowserClientHostCommandEvent
} from '../../../../shared/browser-client-host-protocol'
import { withWebClientUpgradeMarker } from '../../../../shared/web-origin-security'
import { WEB_PAIRED_E2EE_PRIMITIVES } from '../../web/web-paired-e2ee-primitives'

/** The host bundle interface version 66-02 checks before it calls attachBrowserHost. */
export const PB_BROWSER_HOST_API = 1

export type BrowserHostCredential =
  | { kind: 'token'; deviceToken: string }
  | { kind: 'device-key'; deviceId: string; sign: (message: Uint8Array) => Promise<Uint8Array> }

export type BrowserHostOutcome =
  | { status: 'completed'; result?: unknown }
  | { status: 'failed'; errorCode: string }

export type BrowserHostPageMetadata = {
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

/** A page's own placement generations, as its last committed command event gave them (66-CR-02). */
export type BrowserHostPageGenerations = { browserHostGeneration: number; pageHostGeneration: number }

/** T-66-04: the link's placement capability for this attach (pb-browser-host-link.ts). */
export type BrowserHostPlacement = { attached: (browserHostClientId: string) => void; detached: () => void }

export type BrowserHostSession = {
  browserHostClientId: string
  commandResult: (event: BrowserClientHostCommandEvent, outcome: BrowserHostOutcome) => Promise<unknown>
  pageMetadata: (
    browserPageId: string,
    metadata: BrowserHostPageMetadata,
    page?: BrowserHostPageGenerations
  ) => Promise<unknown>
  userClosedPage: (worktreeSelector: string, browserPageId: string) => Promise<unknown>
  detach: () => void
}

export type AttachBrowserHostOptions = {
  connection: Pick<PairedRuntimeConnection, 'endpoint' | 'hostPublicKeyB64'>
  credential: BrowserHostCredential
  browserHostClientId: string
  inventory?: () => unknown[]
  onCommand: (event: BrowserClientHostCommandEvent) => void
  onDetached?: (reason: string) => void
  placement?: BrowserHostPlacement
}

type Frame = {
  id?: unknown
  ok?: boolean
  result?: unknown
  error?: { code?: string }
  _meta?: { runtimeId?: string | null }
}

// D-34 (P66-09): the pane entry keeps an Orca store row per page whose web tab is open; the bundle namespace is stored
// under this key by @powerbrowser/orca-panes (C3). Absent (a Node probe, a pane bundle that did not boot): no row.
const PANES_MODULE_KEY = Symbol.for('powerbrowser.orca-panes.module')
type PaneRows = { addBrowserPage?: (worktreeId: string, browserPageId: string) => boolean; removeBrowserPage?: (browserPageId: string) => void }

function paneRows(): PaneRows | undefined {
  return (globalThis as Record<symbol, unknown>)[PANES_MODULE_KEY] as PaneRows | undefined
}

/** A completed createPage adds the page's row, a completed closePage drops it; a row failure never touches the host. */
function followRow(event: BrowserClientHostCommandEvent, outcome: BrowserHostOutcome): void {
  if (outcome.status !== 'completed') return
  try {
    // A restorePage completes with a new tab after orcad's close-then-restore (66-CR-03 review), so its row returns too.
    if ((event.command.type === 'createPage' || event.command.type === 'restorePage') && event.command.workspaceId) {
      paneRows()?.addBrowserPage?.(event.command.workspaceId, event.browserPageId)
    } else if (event.command.type === 'closePage') {
      paneRows()?.removeBrowserPage?.(event.browserPageId)
    }
  } catch {
    // the store refused the row; the page and its web tab are unaffected
  }
}

const ATTACH_TIMEOUT_MS = 15_000
const CALL_TIMEOUT_MS = 20_000
/** browser-host-page-authority.ts: the page's host dropped its socket and is inside its reconnect grace. */
const LEASE_RECONNECTING = 'browser_host_lease_reconnecting'
// BrowserClientPageMetadataParams' url and title caps (browser-client-page-metadata-protocol.ts).
const PAGE_METADATA_URL_MAX = 8192
const PAGE_METADATA_TITLE_MAX = 4096
const CLIENT_CAPABILITIES = [
  BROWSER_CLIENT_HOST_RUNTIME_CAPABILITY,
  BROWSER_CLIENT_PAGE_METADATA_RUNTIME_CAPABILITY
]

/**
 * Opens the host's own connection, authenticates, reads authorityRuntimeId from status.get and attaches. Resolves
 * with the session once orcad sends the lease's ready event. A socket close, an attach refusal or the 15 s timeout
 * calls onDetached once with a code (and rejects the promise with that code if it is still pending).
 */
export function attachBrowserHost(options: AttachBrowserHostOptions): Promise<BrowserHostSession> {
  const { connection, credential, browserHostClientId, onCommand, onDetached, placement } = options
  if (typeof browserHostClientId !== 'string' || !browserHostClientId) {
    return Promise.reject(new Error('invalid_host_id'))
  }
  if (credential?.kind !== 'token' && credential?.kind !== 'device-key') {
    return Promise.reject(new Error('invalid_credential'))
  }
  const keyed = credential.kind === 'device-key'
  // A9: v2 is created on the device-key branch only; a token never travels over v2 (no capabilities would).
  const handshake = keyed
    ? createPairedE2EEClientHandshake({
        primitives: WEB_PAIRED_E2EE_PRIMITIVES,
        hostPublicKeyB64: connection.hostPublicKeyB64,
        framing: 'v2',
        transport: 'direct'
      })
    : createPairedE2EEClientHandshake({
        primitives: WEB_PAIRED_E2EE_PRIMITIVES,
        hostPublicKeyB64: connection.hostPublicKeyB64,
        framing: 'legacy'
      })
  const ws = new WebSocket(withWebClientUpgradeMarker(connection.endpoint))
  const pending = new Map<string, (frame: Frame) => void>()
  // pageHostGeneration per page, from the command events; metadata needs it.
  const pageGenerations = new Map<string, number>()
  const revisions = new Map<string, number>()
  let lease: { authorityEpoch: string; browserHostGeneration: number } | null = null
  let state: 'hello' | 'auth' | 'open' = 'hello'
  let attachId: string | null = null
  let ended = false
  let placed = false
  let seq = 0

  return new Promise<BrowserHostSession>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => end('handshake_timeout'), ATTACH_TIMEOUT_MS)

    function end(reason: string, notify = true): void {
      if (ended) return
      ended = true
      clearTimeout(timer)
      for (const done of pending.values()) done({ ok: false, error: { code: reason } })
      pending.clear()
      if (placed) {
        placed = false
        try {
          placement?.detached()
        } catch {
          // the link is gone with the pane bundle
        }
      }
      try {
        ws.close()
      } catch {
        // already closed
      }
      if (!settled) {
        settled = true
        reject(new Error(reason))
      }
      if (notify) onDetached?.(reason)
    }

    // A keyed socket sends no device token (Orca's withoutTokenOnKeyedSocket rule).
    function send(message: Record<string, unknown>): void {
      const framed = credential.kind === 'token' ? { ...message, deviceToken: credential.deviceToken } : message
      ws.send(handshake.channel.sealText(JSON.stringify(framed)))
    }

    function request(method: string, params?: unknown): Promise<Frame> {
      if (ended) return Promise.resolve({ ok: false, error: { code: 'detached' } })
      const id = `pb-host-req-${++seq}`
      return new Promise<Frame>((done) => {
        const t = setTimeout(() => {
          pending.delete(id)
          done({ ok: false, error: { code: 'call_timeout' } })
        }, CALL_TIMEOUT_MS)
        pending.set(id, (frame) => {
          clearTimeout(t)
          done(frame)
        })
        send({ id, method, params })
      })
    }

    async function call(method: string, params: unknown): Promise<unknown> {
      const frame = await request(method, params)
      if (!frame.ok) {
        // orcad sends this refusal as a generic code with the name in the message; the caller has to tell it apart,
        // because it ends by itself with the lease's reconnect grace.
        const error = frame.error as { code?: string; message?: string } | undefined
        throw new Error(error?.message === LEASE_RECONNECTING ? LEASE_RECONNECTING : (error?.code ?? 'call_failed'))
      }
      return frame.result
    }

    const session: BrowserHostSession = {
      browserHostClientId,
      commandResult: (event, outcome) => {
        followRow(event, outcome)
        const { type: _type, command: _command, ...authority } = event
        const { result, ...rest } = outcome as { status: string; result?: unknown; errorCode?: string }
        // Orca's result schema names the completed value `value`.
        return call('browser.clientHost.commandResult', {
          ...authority,
          result: result === undefined ? rest : { ...rest, value: result }
        })
      },
      // 66-CR-02: a page bound before a re-attach gets no new command event when orcad keeps it, so the caller passes
      // the page's own generations (its last committed command event's); orcad checks both against the page's placement.
      pageMetadata: (browserPageId, metadata, page) => {
        const pageHostGeneration = page?.pageHostGeneration ?? pageGenerations.get(browserPageId)
        const browserHostGeneration = page?.browserHostGeneration ?? lease?.browserHostGeneration
        if (!lease || pageHostGeneration === undefined || browserHostGeneration === undefined) {
          return Promise.reject(new Error('unknown_page'))
        }
        const revision = (revisions.get(browserPageId) ?? 0) + 1
        revisions.set(browserPageId, revision)
        // 66-CR-02: Orca's schema requires every field, the three flags as booleans, url and title within their caps;
        // a missing flag would drop out of the JSON and the whole update would be refused.
        return call('browser.clientHost.pageMetadata', {
          browserHostClientId,
          browserHostGeneration,
          browserPageId,
          pageHostGeneration,
          revision,
          url: String(metadata.url ?? '').slice(0, PAGE_METADATA_URL_MAX),
          title: String(metadata.title ?? '').slice(0, PAGE_METADATA_TITLE_MAX),
          loading: metadata.loading === true,
          canGoBack: metadata.canGoBack === true,
          canGoForward: metadata.canGoForward === true
        })
      },
      // A7: the user's close, on this connection; orcad then sends closePage, which the caller answers completed.
      userClosedPage: (worktreeSelector, browserPageId) => {
        try {
          paneRows()?.removeBrowserPage?.(browserPageId)
        } catch {
          // as in followRow
        }
        return call('browser.tabClose', { worktree: worktreeSelector, page: browserPageId })
      },
      detach: () => end('detached', false)
    }

    function onAttachFrame(frame: Frame): void {
      if (!frame.ok) return end(`attach_refused:${frame.error?.code ?? 'unknown'}`)
      if ((frame.result as { type?: unknown } | undefined)?.type === 'end') return end('attach_ended')
      const parsed = BrowserClientHostEvent.safeParse(frame.result)
      if (!parsed.success) return
      const event = parsed.data
      if (event.type === 'ready') {
        lease = { authorityEpoch: event.authorityEpoch, browserHostGeneration: event.browserHostGeneration }
        // T-66-04: orcad has made this id's lease; place new pages on it before the session is published, so no
        // placement failure can leave a published session behind.
        try {
          placement?.attached(browserHostClientId)
          placed = placement !== undefined
        } catch {
          return end('placement_refused')
        }
        if (!settled) {
          settled = true
          clearTimeout(timer)
          resolve(session)
        }
        return
      }
      if (event.type === 'revoked') return end(`revoked:${event.reason}`)
      pageGenerations.set(event.browserPageId, event.pageHostGeneration)
      if (event.command.type === 'closePage') revisions.delete(event.browserPageId)
      try {
        onCommand(event)
      } catch {
        // The caller's handler failing must not end the host's connection.
      }
    }

    async function attach(): Promise<void> {
      const status = await request('status.get')
      const authorityRuntimeId = status._meta?.runtimeId
      if (!status.ok || typeof authorityRuntimeId !== 'string' || !authorityRuntimeId) {
        return end(`status_unavailable:${status.error?.code ?? 'no_runtime_id'}`)
      }
      if (ended) return
      attachId = `pb-host-attach-${++seq}`
      send({
        id: attachId,
        method: 'browser.clientHost.attach',
        params: {
          authorityRuntimeId,
          browserHostClientId,
          hostCapabilities: ['webview', BROWSER_CLIENT_AUTOMATION_HOST_CAPABILITY],
          pageCommandProtocolVersion: 1,
          pageInventoryProtocolVersion: 1,
          pageInventory: options.inventory?.() ?? [],
          // 66-CR-02/03: a socket drop then keeps the lease (same generation) through orcad's reconnect grace, as
          // Orca's desktop host negotiates it, so bound pages keep their placement and their metadata path.
          leaseReconnectProtocolVersion: 1,
          pageReconciliationProtocolVersion: 1
        }
      })
    }

    ws.onopen = () => {
      try {
        ws.send(handshake.helloText())
      } catch {
        end('handshake_refused')
      }
    }
    ws.onclose = () => end('socket_closed')
    ws.onmessage = async (message: MessageEvent) => {
      if (ended || typeof message.data !== 'string') return
      if (state === 'hello') {
        const verdict = handshake.acceptReadyText(message.data)
        if (verdict !== 'accepted') return end(`handshake_${verdict}`)
        state = 'auth'
        try {
          ws.send(await handshake.sealAuth(credential, { clientCapabilities: CLIENT_CAPABILITIES }))
        } catch {
          end('auth_unsealable')
        }
        return
      }
      const plain = handshake.channel.openText(message.data)
      if (plain === null) return
      if (state === 'auth') {
        const reply = handshake.classifyAuthReply(plain)
        if (reply.kind === 'authenticated') {
          state = 'open'
          void attach()
        } else if (reply.kind === 'rejected') {
          end(`auth_rejected:${reply.errorCode ?? reply.type ?? 'unknown'}`)
        }
        return
      }
      let frame: Frame
      try {
        frame = JSON.parse(plain) as Frame
      } catch {
        return
      }
      if (typeof frame?.id !== 'string') return
      if (frame.id === attachId) return onAttachFrame(frame)
      const done = pending.get(frame.id)
      if (done) {
        pending.delete(frame.id)
        done(frame)
      }
    }
  })
}
