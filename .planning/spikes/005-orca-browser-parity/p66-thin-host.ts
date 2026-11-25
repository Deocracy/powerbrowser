// Phase 66 research gate (P66-02, P66-04): a thin PB runtime client over Orca's
// shared and web pairing modules, with NO import of web-runtime-client.ts and
// no write to a module constant. build-p66-thin-host.sh copies this file to
// orca/src/renderer/src/web/pb-p66-thin-host.ts (untracked) so the relative
// imports resolve; nothing in orca/ is edited.
//
// One WebSocket. Legacy framing with the offer's device token, so sealAuth's
// public clientCapabilities option carries the browser-host capabilities
// (v2 token auth carries none: paired-e2ee-client-handshake.ts sealAuth).
// Every request, the attach subscription and every commandResult share the
// connection, which is what the lease requires (browser-client-host.ts).
import { createPairedE2EEClientHandshake } from '../../../shared/paired-e2ee-client-handshake'
import { pairedRuntimeConnectionFromOffer } from '../../../shared/paired-runtime-connection'
import {
  BROWSER_CLIENT_HOST_RUNTIME_CAPABILITY,
  BROWSER_CLIENT_PAGE_METADATA_RUNTIME_CAPABILITY
} from '../../../shared/browser-runtime-capabilities'
import { withWebClientUpgradeMarker } from '../../../shared/web-origin-security'
import { WEB_PAIRED_E2EE_PRIMITIVES } from './web-paired-e2ee-primitives'
import { parseWebPairingInput } from './web-pairing'

type Response = { id: string; ok: boolean; result?: unknown; error?: { code: string; message: string } }

export type ThinClient = {
  call: (method: string, params?: unknown, timeoutMs?: number) => Promise<Response>
  subscribe: (method: string, params: unknown, onFrame: (frame: Response) => void) => string
  close: () => void
}

export function connect(pairingInput: string): Promise<ThinClient> {
  const offer = parseWebPairingInput(pairingInput)
  if (!offer) {
    return Promise.reject(new Error('pairing_input_rejected'))
  }
  const connection = pairedRuntimeConnectionFromOffer(offer)
  if (connection.credential.kind !== 'token') {
    return Promise.reject(new Error('token_credential_required'))
  }
  const deviceToken = connection.credential.deviceToken
  const handshake = createPairedE2EEClientHandshake({
    primitives: WEB_PAIRED_E2EE_PRIMITIVES,
    hostPublicKeyB64: connection.hostPublicKeyB64,
    framing: 'legacy'
  })
  const ws = new WebSocket(withWebClientUpgradeMarker(connection.endpoint))
  const pending = new Map<string, (r: Response) => void>()
  const streams = new Map<string, (r: Response) => void>()
  let seq = 0
  const nextId = (): string => `pb-thin-${++seq}`
  const send = (message: unknown): void => ws.send(handshake.channel.sealText(JSON.stringify(message)))

  return new Promise((resolve, reject) => {
    let state: 'handshaking' | 'connected' = 'handshaking'
    const timer = setTimeout(() => reject(new Error('handshake_timeout')), 15_000)
    ws.onopen = () => ws.send(handshake.helloText())
    ws.onerror = () => reject(new Error('socket_error'))
    ws.onmessage = async (event) => {
      if (typeof event.data !== 'string') {
        return
      }
      if (state === 'handshaking') {
        if (handshake.acceptReadyText(event.data) === 'accepted') {
          ws.send(
            await handshake.sealAuth(
              { kind: 'token', deviceToken },
              {
                clientCapabilities: [
                  BROWSER_CLIENT_HOST_RUNTIME_CAPABILITY,
                  BROWSER_CLIENT_PAGE_METADATA_RUNTIME_CAPABILITY
                ]
              }
            )
          )
          return
        }
        const plain = handshake.channel.openText(event.data)
        const reply = plain === null ? null : handshake.classifyAuthReply(plain)
        if (reply?.kind === 'authenticated') {
          state = 'connected'
          clearTimeout(timer)
          resolve({
            call: (method, params, timeoutMs = 20_000) =>
              new Promise((res) => {
                const id = nextId()
                const t = setTimeout(() => {
                  pending.delete(id)
                  res({ id, ok: false, error: { code: 'thin_timeout', message: method } })
                }, timeoutMs)
                pending.set(id, (r) => {
                  clearTimeout(t)
                  res(r)
                })
                send({ id, deviceToken, method, params })
              }),
            subscribe: (method, params, onFrame) => {
              const id = nextId()
              streams.set(id, onFrame)
              send({ id, deviceToken, method, params })
              return id
            },
            close: () => ws.close()
          })
        } else if (reply?.kind === 'rejected') {
          clearTimeout(timer)
          reject(new Error(`auth_rejected:${reply.errorCode ?? reply.type ?? 'unknown'}`))
        }
        return
      }
      const plain = handshake.channel.openText(event.data)
      if (plain === null) {
        return
      }
      let frame: Response
      try {
        frame = JSON.parse(plain) as Response
      } catch {
        return
      }
      if (typeof frame?.id !== 'string') {
        return
      }
      const stream = streams.get(frame.id)
      if (stream) {
        return stream(frame)
      }
      const done = pending.get(frame.id)
      if (done) {
        pending.delete(frame.id)
        done(frame)
      }
    }
  })
}
