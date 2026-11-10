// Spike 005 (BRW-01, P61-13): the S2 seam. A PB runtime client that becomes a
// browser client host for orcad with no Orca file edited.
//
// build-s2-host.sh copies this file to orca/src/renderer/src/web/pb-s2-host.ts
// (untracked there) so the relative imports below resolve to Orca's own web
// runtime client. Nothing of the paired E2EE protocol is reimplemented here.
//
// Two things in this file reach past Orca's public surface. Both are recorded
// in the README as work Phase 66 has to replace:
//  1. the web client's capability list is a module constant, so the client-host
//     capability is appended to that array at run time before the first socket;
//  2. the attach stream and its command results must share one connection
//     (the lease is bound to the connection id), and the public subscribe()
//     opens a dedicated socket, so the private subscribeOnCurrentConnection is
//     called instead.
//
// Scope (T-61-08): goto is served through the caller's onGoto for the single
// page the proof opened. Page create and close are acknowledged because the
// PB tab already exists. Every other command is answered unsupported.
import { BROWSER_CLIENT_AUTOMATION_HOST_CAPABILITY } from '../../../shared/browser-client-automation-protocol'
import {
  BROWSER_CLIENT_HOST_PAGE_COMMAND_PROTOCOL_VERSION,
  BROWSER_CLIENT_HOST_PAGE_INVENTORY_PROTOCOL_VERSION,
  BROWSER_CLIENT_HOST_PAGE_RECONCILIATION_PROTOCOL_VERSION,
  BrowserClientHostEvent,
  type BrowserClientHostCommandEvent,
  type BrowserClientHostCommandResult
} from '../../../shared/browser-client-host-protocol'
import { BROWSER_CLIENT_HOST_RUNTIME_CAPABILITY } from '../../../shared/browser-runtime-capabilities'
import { pairedRuntimeConnectionFromOffer } from '../../../shared/paired-runtime-connection'
import { WEB_RUNTIME_CLIENT_CAPABILITIES } from '../../../shared/web-runtime-client-capabilities'
import { parseWebPairingInput } from './web-pairing'
import { WebRuntimeClient } from './web-runtime-client'

// Orca keeps this name in src/main (browser-host-capability-selection.ts), which a web bundle cannot import.
const BROWSER_HOST_WEBVIEW_CAPABILITY = 'webview'

type GotoResult = { url: string; title: string }
type StartOptions = { pairingInput: string; onGoto: (url: string) => Promise<GotoResult> }
type StartResult = { outcome: string; runtimeId?: string; commands: string[] }

export async function start({ pairingInput, onGoto }: StartOptions): Promise<StartResult> {
  const commands: string[] = []
  const offer = parseWebPairingInput(pairingInput)
  if (!offer) {
    return { outcome: 'pairing_input_rejected', commands }
  }
  const capabilities = WEB_RUNTIME_CLIENT_CAPABILITIES as unknown as string[]
  if (!capabilities.includes(BROWSER_CLIENT_HOST_RUNTIME_CAPABILITY)) {
    capabilities.push(BROWSER_CLIENT_HOST_RUNTIME_CAPABILITY)
  }
  const client = new WebRuntimeClient(pairedRuntimeConnectionFromOffer(offer))
  const status = await client.call('status.get', undefined, { timeoutMs: 15_000 })
  if (!status.ok) {
    return { outcome: `status_failed: ${status.error.code}`, commands }
  }
  const runtimeId = status._meta.runtimeId

  const settle = async (
    event: BrowserClientHostCommandEvent,
    result: BrowserClientHostCommandResult
  ): Promise<void> => {
    const { type: _type, command: _command, ...authority } = event
    const ack = await client.call('browser.clientHost.commandResult', { ...authority, result })
    commands.push(`${event.command.type}:${result.status}:${ack.ok ? 'acked' : ack.error.code}`)
  }

  const serve = async (event: BrowserClientHostCommandEvent): Promise<void> => {
    const command = event.command
    try {
      if (command.type === 'createPage' || command.type === 'closePage') {
        return await settle(event, { status: 'completed' })
      }
      if (command.type === 'navigate') {
        await onGoto(command.url)
        return await settle(event, { status: 'completed' })
      }
      if (command.type === 'automation' && command.method === 'browser.goto') {
        const value = await onGoto(String(command.params.url))
        return await settle(event, { status: 'completed', value })
      }
      return await settle(event, { status: 'failed', errorCode: 'browser_command_unavailable' })
    } catch (error) {
      commands.push(`${command.type}:threw:${error instanceof Error ? error.message : 'unknown'}`)
      await settle(event, { status: 'failed', errorCode: 'pb_host_command_failed' }).catch(() => {})
    }
  }

  return new Promise<StartResult>((resolve) => {
    const done = (outcome: string): void => resolve({ outcome, runtimeId, commands })
    const timer = setTimeout(() => done('attach_timeout'), 20_000)
    const callbacks = {
      onResponse: (response: Awaited<ReturnType<WebRuntimeClient['call']>>): void => {
        if (!response.ok) {
          clearTimeout(timer)
          return done(`${response.error.code}: ${response.error.message}`)
        }
        const parsed = BrowserClientHostEvent.safeParse(response.result)
        if (!parsed.success) {
          return void commands.push('unparsed_event')
        }
        if (parsed.data.type === 'ready') {
          clearTimeout(timer)
          return done('accepted')
        }
        if (parsed.data.type === 'command') {
          return void serve(parsed.data)
        }
        commands.push(`revoked:${parsed.data.reason}`)
      },
      onError: (error: { code: string; message: string }): void => {
        clearTimeout(timer)
        done(`${error.code}: ${error.message}`)
      },
      onClose: (): void => void commands.push('stream_closed')
    }
    const attach = {
      authorityRuntimeId: runtimeId,
      browserHostClientId: `pb-s2-${crypto.randomUUID()}`,
      hostCapabilities: [BROWSER_HOST_WEBVIEW_CAPABILITY, BROWSER_CLIENT_AUTOMATION_HOST_CAPABILITY],
      pageCommandProtocolVersion: BROWSER_CLIENT_HOST_PAGE_COMMAND_PROTOCOL_VERSION,
      pageInventoryProtocolVersion: BROWSER_CLIENT_HOST_PAGE_INVENTORY_PROTOCOL_VERSION,
      pageInventory: [],
      pageReconciliationProtocolVersion: BROWSER_CLIENT_HOST_PAGE_RECONCILIATION_PROTOCOL_VERSION
    }
    // Private in Orca's typings; see note 2 in the header.
    const sameConnection = client as unknown as {
      subscribeOnCurrentConnection(m: string, p: unknown, c: typeof callbacks): Promise<unknown>
    }
    sameConnection
      .subscribeOnCurrentConnection('browser.clientHost.attach', attach, callbacks)
      .catch((error: unknown) => {
        clearTimeout(timer)
        done(`subscribe_failed: ${error instanceof Error ? error.message : 'unknown'}`)
      })
  })
}
