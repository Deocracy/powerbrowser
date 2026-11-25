// PowerBrowser overlay file (Phase 66, BRW-02, BRW-03; A3 (a) and (b), T-66-01, T-66-04; marker
// pb-overlay:src/renderer/src/pb/browser-host/pb-browser-host-link.ts): the pane bundle's link to the thin browser
// host. The pane entry (pb-pane-mount.tsx) imports it for its side effect, so it runs in the pane client's own module
// graph: webRuntimeCredentialFor caches one credential source per environment, so the plan read here is the pane
// client's, and the thin host authenticates as the same paired device (orcad refuses a client placement from another
// device with browser_host_lease_stale).
//
// On evaluation it defines globalThis[Symbol.for('powerbrowser.orca-browser.link')] = { connection }
// (non-writable, not configurable). Each connection() result carries a placement capability for that one attach
// (T-66-04): the thin host calls its attached(id) when orcad's lease is ready and detached() when it ends. Once the pane client's first runtime call has completed (a status.get through
// window.api, so a device-key migration has already happened), it dispatches the window event
// 'powerbrowser-orca-browser-link'; connection() rejects with link_not_ready before that, and again after a re-pair
// until the pane client has made a status call under the new pairing (66-WR-01). Nothing here logs, and
// no error carries a token, key, endpoint or offer.
import { readStoredWebRuntimeEnvironment } from '../../web/web-runtime-environment'
import { webRuntimeCredentialFor } from '../../web/preload-api/web-runtime-credentials'

const LINK_MARKER = 'pb-overlay:src/renderer/src/pb/browser-host/pb-browser-host-link.ts'
const LINK_KEY = Symbol.for('powerbrowser.orca-browser.link')
const LINK_EVENT = 'powerbrowser-orca-browser-link'
const POLL_MS = 250

export type BrowserHostLinkCredential =
  | { kind: 'token'; deviceToken: string }
  | { kind: 'device-key'; deviceId: string; sign: (message: Uint8Array) => Promise<Uint8Array> }

type Placement = { kind: 'server' } | { kind: 'client'; browserHostClientId: string }
type RuntimeEnvironmentsApi = {
  getStatus: (args: { selector: string }) => Promise<{ ok?: boolean }>
  prepareBrowserClientHostPlacement: () => Promise<Placement>
}

let ready = false
// 66-WR-01: the credential source key (webRuntimeCredentialFor's cache key: environment id, pairing revision, endpoint
// key) readiness was armed for. A re-pair changes it; connection() then waits for the pane client's next status call,
// which creates the new source with the pane client's own callbacks, rather than creating and caching it here with
// none (a stored token would never be forgotten and a revoked device would never drop its pairing).
let readyKey: string | null = null
let polling = false
// T-66-04: the placement capability whose attach is live, and the id it attached with.
let livePlacement: { capability: BrowserHostPlacement; browserHostClientId: string } | null = null

/** One attach's placement: bound to the first id it is given, which the thin host gives at its lease's ready event. */
export type BrowserHostPlacement = Readonly<{ attached: (browserHostClientId: string) => void; detached: () => void }>

type StoredEnvironment = NonNullable<ReturnType<typeof readStoredWebRuntimeEnvironment>>

function preferredEndpoint(environment: StoredEnvironment): StoredEnvironment['endpoints'][number] | undefined {
  return environment.endpoints.find((entry) => entry.id === environment.preferredEndpointId) ?? environment.endpoints[0]
}

/** The key webRuntimeCredentialFor caches the environment's credential source under. */
function credentialKey(environment: StoredEnvironment): string {
  return `${environment.id}\0${environment.pairingRevision ?? environment.createdAt}\0${preferredEndpoint(environment)?.publicKeyB64}`
}

function runtimeEnvironments(): RuntimeEnvironmentsApi | null {
  return ((window as unknown as { api?: { runtimeEnvironments?: RuntimeEnvironmentsApi } }).api?.runtimeEnvironments ??
    null)
}

/** The pane client's endpoint and its current credential: legacy-token -> token, device-key -> device-key (A3 b). */
async function connection(): Promise<{
  endpoint: string
  hostPublicKeyB64: string
  credential: BrowserHostLinkCredential
  placement: BrowserHostPlacement
}> {
  if (!ready) throw new Error('link_not_ready')
  const environment = readStoredWebRuntimeEnvironment()
  if (!environment) throw new Error('no_environment')
  if (credentialKey(environment) !== readyKey) {
    ready = false
    awaitPaneClient()
    throw new Error('link_not_ready')
  }
  const endpoint = preferredEndpoint(environment)
  if (!endpoint) throw new Error('no_endpoint')
  // The pane client's status call created the source under this key (readyKey), so this is a cache hit and these
  // callbacks are never bound.
  const plan = await webRuntimeCredentialFor(environment, {
    forgetStoredToken: () => {},
    forgetPairing: () => {}
  }).nextPlan(false)
  const base = { endpoint: endpoint.endpoint, hostPublicKeyB64: endpoint.publicKeyB64, placement: placementCapability() }
  if (plan.kind === 'legacy-token') return { ...base, credential: { kind: 'token', deviceToken: plan.deviceToken } }
  if (plan.kind === 'device-key') {
    const { key } = plan
    return { ...base, credential: { kind: 'device-key', deviceId: plan.deviceId, sign: (message) => key.sign(message) } }
  }
  throw new Error(`unsupported_plan:${plan.kind}`)
}

/** A3 (a): Orca's renderer creates browser pages on the thin host (an id) or, with none, back on the server. */
function applyPlacement(placement: Placement): void {
  const api = runtimeEnvironments()
  if (!api) throw new Error('link_not_ready')
  // window.api is Orca's withFallback proxy with no set trap, so this lands on the underlying object.
  api.prepareBrowserClientHostPlacement = async () => ({ ...placement })
}

/**
 * T-66-04: placement is set only through the capability of one connection() result, which the thin host holds for one
 * attach. It names the id that attach sent, only once orcad has made the lease (ready), and only that id; the last
 * attach to become ready holds the placement, and its end puts placement back on the server unless a later attach holds
 * it. A script that places an id before the host attaches is therefore replaced by the host's own attach, and nothing
 * here can refuse the host's attach. Same-realm script that calls connection() itself can still place an id, as it can
 * still assign prepareBrowserClientHostPlacement directly (T-66-01); this binds placement to an attach, it is not a wall.
 */
function placementCapability(): BrowserHostPlacement {
  let boundId: string | null = null
  const capability: BrowserHostPlacement = Object.freeze({
    attached: (browserHostClientId: string) => {
      if (typeof browserHostClientId !== 'string' || !browserHostClientId) throw new TypeError('invalid_host_id')
      if (boundId !== null && browserHostClientId !== boundId) throw new Error('placement_refused')
      applyPlacement({ kind: 'client', browserHostClientId })
      boundId = browserHostClientId
      livePlacement = { capability, browserHostClientId }
    },
    detached: () => {
      if (livePlacement?.capability !== capability) return
      livePlacement = null
      try {
        applyPlacement({ kind: 'server' })
      } catch {
        // window.api is gone with the document
      }
    }
  })
  return capability
}

/** Arms readiness once the pane client has completed a status call; one poll at a time. */
function awaitPaneClient(): void {
  if (polling) return
  polling = true
  pollPaneClient()
}

// shortcut: polls every 250 ms for window.api and a stored environment, because the pane entry exposes no readiness
// promise; replace with the entry's own signal if it ever exports one.
function pollPaneClient(): void {
  const api = runtimeEnvironments()
  const environment = readStoredWebRuntimeEnvironment()
  if (!api || !environment) {
    setTimeout(pollPaneClient, POLL_MS)
    return
  }
  const key = credentialKey(environment)
  api.getStatus({ selector: 'active' }).then(
    (status) => {
      const after = readStoredWebRuntimeEnvironment()
      // A pairing that changed during the call is armed by the next call, made under it.
      if (status?.ok !== true || !after || credentialKey(after) !== key) return void setTimeout(pollPaneClient, POLL_MS * 4)
      readyKey = key
      ready = true
      polling = false
      window.dispatchEvent(new Event(LINK_EVENT))
    },
    () => void setTimeout(pollPaneClient, POLL_MS * 4)
  )
}

if (!Object.prototype.hasOwnProperty.call(globalThis, LINK_KEY)) {
  Object.defineProperty(globalThis, LINK_KEY, {
    value: Object.freeze({ connection, build: Object.freeze([LINK_MARKER]) }),
    writable: false,
    configurable: false,
    enumerable: false
  })
  awaitPaneClient()
}
