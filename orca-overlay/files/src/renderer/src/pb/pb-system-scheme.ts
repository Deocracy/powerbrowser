// PowerBrowser overlay file (D-65): inside the Theia document "the system's colour scheme" is Theia's theme. Orca reads
// it through window.matchMedia('(prefers-color-scheme: dark)') while its own theme setting is System; that one query
// answers from Theia's body class (theia-dark, theia-light, theia-hc, theia-hcLight), and its listeners hear a theme
// change. Every other query, and a document with no Theia theme class, keeps the browser's answer. Orca's explicit Light
// or Dark never asks. scripts/build-orca.sh copies this file to orca/src/renderer/src/pb/.
const PB_SYSTEM_SCHEME_MARKER = 'pb-overlay:src/renderer/src/pb/pb-system-scheme.ts'

const QUERY = '(prefers-color-scheme: dark)'

function theiaDark(): boolean | null {
  const c = document.body?.classList
  if (!c) return null
  if (c.contains('theia-dark') || c.contains('theia-hc')) return true
  if (c.contains('theia-light') || c.contains('theia-hcLight')) return false
  return null
}

const native = window.matchMedia.bind(window)
const subscribers = new Set<() => void>()
let last = theiaDark()

function schemeList(): MediaQueryList {
  const real = native(QUERY)
  const target = new EventTarget()
  const list = {
    media: QUERY,
    onchange: null as ((event: MediaQueryListEvent) => void) | null,
    get matches(): boolean {
      return theiaDark() ?? real.matches
    },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
    addListener: (cb: EventListener | null) => target.addEventListener('change', cb),
    removeListener: (cb: EventListener | null) => target.removeEventListener('change', cb)
  }
  subscribers.add(() => {
    const event = new MediaQueryListEvent('change', { media: QUERY, matches: list.matches })
    list.onchange?.(event)
    target.dispatchEvent(event)
  })
  return list as unknown as MediaQueryList
}

// One list for the document, so repeated calls add no subscriber.
let shared: MediaQueryList | null = null
window.matchMedia = (query: string): MediaQueryList =>
  query === QUERY && theiaDark() !== null ? (shared ??= schemeList()) : native(query)

Object.defineProperty(window.matchMedia, 'pbOverlay', { value: PB_SYSTEM_SCHEME_MARKER })

new MutationObserver(() => {
  const now = theiaDark()
  if (now === last) return
  last = now
  for (const notify of subscribers) notify()
}).observe(document.body, { attributeFilter: ['class'] })

export {}
