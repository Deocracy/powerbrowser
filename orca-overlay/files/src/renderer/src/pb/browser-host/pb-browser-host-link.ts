// PowerBrowser overlay file (Phase 66, BRW-02, BRW-03; A3 (a) and (b), T-66-01, T-66-04; marker
// pb-overlay:src/renderer/src/pb/browser-host/pb-browser-host-link.ts): the pane bundle's link to the thin browser
// host. The pane entry (pb-pane-mount.tsx) imports it for its side effect, so it runs in the pane client's own module
// graph: webRuntimeCredentialFor caches one credential source per environment, so the plan read here is the pane
// client's, and the thin host authenticates as the same paired device (orcad refuses a client placement from another
// device with browser_host_lease_stale).
//
// On evaluation it defines globalThis[Symbol.for('powerbrowser.orca-browser.link')] = { connection, setPlacement }
// (non-writable, not configurable). Once the pane client's first runtime call has completed (a status.get through
// window.api, so a device-key migration has already happened), it dispatches the window event
// 'powerbrowser-orca-browser-link' once; connection() rejects with link_not_ready before that. Nothing here logs, and
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

function runtimeEnvironments(): RuntimeEnvironmentsApi | null {
  return ((window as unknown as { api?: { runtimeEnvironments?: RuntimeEnvironmentsApi } }).api?.runtimeEnvironments ??
    null)
}

/** The pane client's endpoint and its current credential: legacy-token -> token, device-key -> device-key (A3 b). */
async function connection(): Promise<{ endpoint: string; hostPublicKeyB64: string; credential: BrowserHostLinkCredential }> {
  if (!ready) throw new Error('link_not_ready')
  const environment = readStoredWebRuntimeEnvironment()
  if (!environment) throw new Error('no_environment')
  const endpoint =
    environment.endpoints.find((entry) => entry.id === environment.preferredEndpointId) ?? environment.endpoints[0]
  if (!endpoint) throw new Error('no_endpoint')
  // The pane client created this source on its first call; the callbacks are used only on a cache miss.
  const plan = await webRuntimeCredentialFor(environment, {
    forgetStoredToken: () => {},
    forgetPairing: () => {}
  }).nextPlan(false)
  const base = { endpoint: endpoint.endpoint, hostPublicKeyB64: endpoint.publicKeyB64 }
  if (plan.kind === 'legacy-token') return { ...base, credential: { kind: 'token', deviceToken: plan.deviceToken } }
  if (plan.kind === 'device-key') {
    const { key } = plan
    return { ...base, credential: { kind: 'device-key', deviceId: plan.deviceId, sign: (message) => key.sign(message) } }
  }
  throw new Error(`unsupported_plan:${plan.kind}`)
}

/** A3 (a): Orca's renderer creates browser pages on the thin host (id) or, with null, back on the server. */
function setPlacement(browserHostClientId: string | null): void {
  if (browserHostClientId !== null && (typeof browserHostClientId !== 'string' || !browserHostClientId)) {
    throw new TypeError('invalid_host_id')
  }
  const api = runtimeEnvironments()
  if (!api) throw new Error('link_not_ready')
  const placement: Placement =
    browserHostClientId === null ? { kind: 'server' } : { kind: 'client', browserHostClientId }
  // window.api is Orca's withFallback proxy with no set trap, so this lands on the underlying object.
  api.prepareBrowserClientHostPlacement = async () => ({ ...placement })
}

// shortcut: polls every 250 ms for window.api and a stored environment, because the pane entry exposes no readiness
// promise; replace with the entry's own signal if it ever exports one.
function awaitPaneClient(): void {
  const api = runtimeEnvironments()
  if (!api || !readStoredWebRuntimeEnvironment()) {
    setTimeout(awaitPaneClient, POLL_MS)
    return
  }
  api.getStatus({ selector: 'active' }).then(
    (status) => {
      if (status?.ok !== true) return void setTimeout(awaitPaneClient, POLL_MS * 4)
      ready = true
      window.dispatchEvent(new Event(LINK_EVENT))
    },
    () => void setTimeout(awaitPaneClient, POLL_MS * 4)
  )
}

if (!Object.prototype.hasOwnProperty.call(globalThis, LINK_KEY)) {
  Object.defineProperty(globalThis, LINK_KEY, {
    value: Object.freeze({ connection, setPlacement, build: Object.freeze([LINK_MARKER]) }),
    writable: false,
    configurable: false,
    enumerable: false
  })
  awaitPaneClient()
}
