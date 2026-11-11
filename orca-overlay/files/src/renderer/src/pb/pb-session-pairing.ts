// PowerBrowser overlay file (Phase 65, P65-17, CA-07, B-8): session-only pairing for the pane bundle.
// scripts/build-orca.sh copies it to orca/src/renderer/src/pb/. The bundle presets Orca's device-key support to
// session-no-ed25519 through Orca's own test setter before Orca's initWebDeviceKeySupport (which keeps a preset
// value), so a pairing made in the Theia origin keeps its device token in page memory and never asks the browser
// for a persistent key. No function here logs, stores or returns the offer, the URL or the token; an error
// carries a reason word only.
import {
  readWebDeviceKeySupport,
  setWebDeviceKeySupportForTests
} from '../web/web-device-key-support'
import { parseWebPairingInput, readPairingInputFromLocation } from '../web/web-pairing'
import {
  createStoredWebRuntimeEnvironment,
  readStoredWebRuntimeEnvironment,
  saveStoredWebRuntimeEnvironment,
  type StoredWebRuntimeEnvironment
} from '../web/web-runtime-environment'
import {
  closeActiveRuntimeClients,
  manuallyDisconnectedEnvironmentIds,
  webRuntimeState
} from '../web/preload-api/web-runtime-session'

const SESSION_PAIRING_MARKER = 'pb-overlay:src/renderer/src/pb/pb-session-pairing.ts'

/** This file's marker literal (orca-overlay-built reads it through the entry's PB_OVERLAY_BUILD). */
export const SESSION_PAIRING_BUILD: readonly string[] = Object.freeze([SESSION_PAIRING_MARKER])

const SESSION_ONLY_SUPPORT = 'session-no-ed25519'

/** Called immediately before Orca's initWebDeviceKeySupport, which keeps a preset value (detected ??=). */
export function presetSessionOnly(): void {
  setWebDeviceKeySupportForTests(SESSION_ONLY_SUPPORT)
}

/** True only when the support reads session-no-ed25519 and the saved environment is session-only. */
export function assertSessionOnly(): boolean {
  return readWebDeviceKeySupport() === SESSION_ONLY_SUPPORT && readStoredWebRuntimeEnvironment()?.sessionOnly === true
}

/** What state() reports: no id, no endpoint, no token. */
export function pairingState(): { sessionOnly: boolean; deviceKeySupport: string | null } {
  return {
    sessionOnly: readStoredWebRuntimeEnvironment()?.sessionOnly === true,
    deviceKeySupport: readWebDeviceKeySupport()
  }
}

// The bridge folder's web-pairing file holds orcad's web-client URL (C64-5). Orca's own web client reads the
// offer from that URL's location, so the bundle does the same; a bare offer passes through.
export function pairingInputOf(input: string): string {
  const trimmed = input.trim()
  if (!/^https?:\/\//i.test(trimmed)) return trimmed
  try {
    return readPairingInputFromLocation(new URL(trimmed)) ?? trimmed
  } catch {
    return trimmed
  }
}

// D-36: the environment this document last paired, without its device token, so a re-pair after a host restart keeps
// the id even when the client already forgot its pairing (a new id strands the host's sessions, A6). Page memory only.
let lastPaired: StoredWebRuntimeEnvironment | null = null

function reason(word: string): Error {
  return new Error(`orca pane pairing: ${word}`)
}

/**
 * The pairing steps bootstrap runs, session-only: parse the offer (an offer string or orcad's web-client URL),
 * create the environment, save it with sessionOnly. Throws a reason word only.
 */
export async function pairSessionOnly(input: string): Promise<void> {
  let offer: Awaited<ReturnType<typeof parseWebPairingInput>>
  try {
    offer = await parseWebPairingInput(pairingInputOf(input))
  } catch {
    throw reason('unreadable offer')
  }
  if (!offer || offer.scope !== 'runtime') throw reason('not a runtime offer')
  let environment: Awaited<ReturnType<typeof createStoredWebRuntimeEnvironment>>
  try {
    environment = await createStoredWebRuntimeEnvironment({
      name: 'Orca Server',
      offer,
      previousEnvironment: readStoredWebRuntimeEnvironment() ?? lastPaired
    })
  } catch {
    throw reason('environment not created')
  }
  // D-36, as the client's own addFromPairingCode: the open client still holds the replaced pairing's session key, and
  // its refusal by a restarted host would forget the active pairing, which must by then be this one.
  closeActiveRuntimeClients()
  // A6: session-only keeps the device token in page memory, never in localStorage.
  saveStoredWebRuntimeEnvironment({ ...environment, sessionOnly: true })
  webRuntimeState.activeEnvironment = readStoredWebRuntimeEnvironment()
  manuallyDisconnectedEnvironmentIds.clear()
  lastPaired = { ...environment, endpoints: environment.endpoints.map((endpoint) => ({ ...endpoint, deviceToken: '' })) }
}

/**
 * B-8, for P67-06's Reconnect and the re-pair after a host restart: re-pair session-only from a new offer, as bootstrap
 * pairs, under the same environment id within this document (D-36), then assert. Repeats none
 * of bootstrap's once-per-document steps (the preload API, the mirror-freeze wrapper, the terminal keys, the
 * services root). Rejects with 'session-only pairing unavailable' when the assertion fails.
 */
export async function repair(offer: string): Promise<void> {
  if (readWebDeviceKeySupport() === null) presetSessionOnly()
  await pairSessionOnly(offer)
  if (!assertSessionOnly()) throw new Error('session-only pairing unavailable')
}
