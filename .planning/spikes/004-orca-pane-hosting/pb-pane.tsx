// Spike 004: the pane page entry (standalone, Route B iframe, Route B' web tab). One terminal
// pane, no Orca shell. build-pb-entry.sh copies this to orca/src/renderer/src/pb/.
import { clearPairingInputFromAddressBar, readPairingInputFromLocation } from '../web/web-pairing'
import * as PbPane from './pb-pane-mount'

// Read everything from the URL before the pairing fragment (a credential) is cleared from it.
const params = new URLSearchParams(window.location.search)
const wantedTab = params.get('tab')
const nonce = params.get('nonce')
const parentOrigin = params.get('parentOrigin')
const observeOnly = params.get('observe') === '1'
// create=1: an empty workspace gets its first terminal from this page (the store's own action).
const create = params.get('create') === '1'
const pairing = readPairingInputFromLocation({ search: '', hash: window.location.hash })
clearPairingInputFromAddressBar()

// Uncaught errors, for the harness: a pane that renders nothing must say why.
const errors: string[] = []
window.addEventListener('error', (event) => errors.push(String(event.error ?? event.message).slice(0, 300)))
window.addEventListener('unhandledrejection', (event) => errors.push(`rejection: ${String(event.reason).slice(0, 300)}`))
;(window as unknown as { __pbErrors: string[] }).__pbErrors = errors

const root = document.getElementById('root') as HTMLElement
const page = window as unknown as { PbPane: typeof PbPane; __pbPaneState: unknown }
page.PbPane = PbPane
page.__pbPaneState = { stage: 'booting' }

function post(message: Record<string, unknown>): void {
  // Route B: the Theia parent checks event.origin and the nonce; targetOrigin keeps it from others.
  if (window.parent !== window && parentOrigin && nonce) {
    window.parent.postMessage({ type: 'pb-layout', nonce, ...message }, parentOrigin)
  }
}

void (async () => {
  try {
    await PbPane.bootstrap({ pairing })
    PbPane.subscribeTabs((change) => post(change))
    if (observeOnly) {
      page.__pbPaneState = { stage: 'observing' }
      post({ opened: [], closed: [], at: PbPane.now(), ready: true })
      return
    }
    const pick = await PbPane.waitForTerminal(wantedTab, 45000, create)
    PbPane.mountPane(root, pick)
    page.__pbPaneState = { stage: 'mounted', ...pick }
    post({ opened: [], closed: [], at: PbPane.now(), ready: true, tabId: pick.tabId })
  } catch (error) {
    page.__pbPaneState = { stage: 'failed', error: String(error) }
    root.textContent = `pb-pane: ${String(error)}`
  }
})()
