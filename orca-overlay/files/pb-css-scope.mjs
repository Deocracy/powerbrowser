// PowerBrowser overlay file (Phase 64, P64-14, P64-15; 64-RESEARCH A3, Pattern 2): the PostCSS
// pass that scopes Orca's emitted stylesheet to the hosted panes. vite.pb-panes.config.ts runs it
// over pb-panes.css in generateBundle, so it sees Tailwind's final output. Importable from Node
// (orca/pb-css-scope.mjs, beside Orca's node_modules/postcss) for the fixtures of orca-pane-css.
//
//   S = :where([data-pb-orca-pane], body > [data-radix-popper-content-wrapper], body > [data-slot])
//   html, :root, body, :host            -> S                  (the scope roots themselves)
//   a qualified root (:root.dark, html[x],
//     body[data-modal-overlay-open])      -> <that root> S     (Orca's own html/body state stays an
//                                                              ancestor condition)
//   a leading .dark / .light compound     -> .dark S ...       (the theme class Orca sets on <html>;
//                                                              not .dark\:x, a variant utility, which is X)
//   any other selector X                  -> S X, X:where(P)   (descendants, plus the portal root
//                                                              itself; a pseudo-element stays last)
//   custom properties of root and theme rules stay on their original selector: Orca's appearance
//   code writes theme tokens to <html>'s inline style, and a scoped copy would shadow them; the
//   exception is the host's own namespaces (--vscode-*, --theia-*), which Theia sets on its root and
//   reads (Monaco's --vscode-sash-size): those are scoped like any other declaration
//   @keyframes names get the prefix pb-orca- (Theia defines `spin` too), and animation,
//   animation-name and --animate* values are rewritten to match
//   prepended: [data-pb-orca-pane] { font-size: medium !important } and :where(P) { font-size: medium }
// Radix portals render with asChild, so the body-level node is the popper wrapper or the shadcn
// content/overlay node itself (react-dialog/dist/index.mjs:84-88, react-popper/dist/index.mjs:200).
import postcss from 'postcss'

export const PB_OVERLAY_MARKER = 'pb-overlay:pb-css-scope.mjs'
export const PANE_ROOT = '[data-pb-orca-pane]'
export const PORTAL_ROOTS = 'body > [data-radix-popper-content-wrapper], body > [data-slot]'
export const SCOPE = `:where(${PANE_ROOT}, ${PORTAL_ROOTS})`
export const KEYFRAME_PREFIX = 'pb-orca-'

const ROOT_RE = /^(html|:root|body|:host)(?![\w-])/
// The theme class only as a whole class token: an escaped character continues the class name, so a Tailwind
// variant utility such as .dark\:bg-input\/30 (Orca's @custom-variant dark) is an ordinary selector, not the root.
const THEME_RE = /^\.(dark|light)(?![\w\\-])/
// Custom-property namespaces the Theia document owns; Orca never writes them on <html>.
export const HOST_OWNED_PROPERTY = /^--(vscode|theia)-/

/** Splits a selector at its first top-level combinator (outside parentheses and brackets). */
function firstCompound(selector) {
  let depth = 0
  for (let i = 0; i < selector.length; i += 1) {
    const c = selector[i]
    if (c === '(' || c === '[') depth += 1
    else if (c === ')' || c === ']') depth -= 1
    else if (depth === 0 && (c === ' ' || c === '>' || c === '+' || c === '~')) {
      return [selector.slice(0, i), selector.slice(i)]
    }
  }
  return [selector, '']
}

export function isRootOrTheme(selector) {
  const [head] = firstCompound(selector.trim())
  return ROOT_RE.test(head) || THEME_RE.test(head)
}

/** One selector to its scoped form(s). */
export function scopeSelector(selector) {
  const sel = selector.trim()
  const [head, rest] = firstCompound(sel)
  const root = ROOT_RE.exec(head)
  if (root) {
    const qualifiers = head.slice(root[0].length)
    if (!qualifiers) return [`${SCOPE}${rest}`]
    // A qualified root stays an ancestor condition; a following bare body/html is the scope root.
    const body = /^(\s+|\s*>\s*)(body|html)(?![\w-])/.exec(rest)
    return [body ? `${head} ${SCOPE}${rest.slice(body[0].length)}` : `${head} ${SCOPE}${rest}`]
  }
  if (THEME_RE.test(head)) return [`${head} ${SCOPE}${rest}`.trim()]
  const pseudo = /(::[\w-]+(?:\([^)]*\))?)$/.exec(sel)
  const self = pseudo
    ? `${sel.slice(0, pseudo.index)}:where(${PORTAL_ROOTS})${pseudo[1]}`
    : `${sel}:where(${PORTAL_ROOTS})`
  return [`${SCOPE} ${sel}`, self]
}

const isAnimationProp = (prop) => prop === 'animation' || prop === 'animation-name' || /^--animat/.test(prop)

// raws.pbScoped marks a rule this pass wrote or already scoped: postcss revisits a changed rule, hands
// visitors a proxy (so a WeakSet of nodes misses), and types raws as open where a node is closed.
export function scopePlugin() {
  return {
    postcssPlugin: 'pb-orca-scope',
    Once(root) {
      // Rename every keyframe first, so the declaration rewrite below sees the whole set.
      const names = new Set()
      root.walkAtRules(/keyframes$/i, (at) => {
        const name = at.params.trim()
        if (name && !name.startsWith(KEYFRAME_PREFIX)) {
          names.add(name)
          at.params = KEYFRAME_PREFIX + name
        }
      })
      if (names.size) {
        const re = new RegExp(`(^|[\\s,])(${[...names].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?=$|[\\s,;])`, 'g')
        root.walkDecls((decl) => {
          if (isAnimationProp(decl.prop)) decl.value = decl.value.replace(re, `$1${KEYFRAME_PREFIX}$2`)
        })
      }
      // The pane root is PB's widget node, which Theia's own class rules also size: the reset must
      // win there. Portal roots are body children whose own Orca classes must still win.
      const paneReset = postcss.rule({ selector: PANE_ROOT, nodes: [postcss.decl({ prop: 'font-size', value: 'medium', important: true })] })
      const portalReset = postcss.rule({ selector: `:where(${PORTAL_ROOTS})`, nodes: [postcss.decl({ prop: 'font-size', value: 'medium' })] })
      paneReset.raws.pbScoped = portalReset.raws.pbScoped = true
      root.prepend(paneReset, portalReset)
    },
    Rule(rule) {
      if (rule.raws.pbScoped) return
      for (let p = rule.parent; p; p = p.parent) {
        if (p.type === 'atrule' && /keyframes$/i.test(p.name)) return
        // A nested rule is scoped through its parent.
        if (p.type === 'rule') return
      }
      const custom = rule.nodes.filter((n) => n.type === 'decl' && n.prop.startsWith('--') && !HOST_OWNED_PROPERTY.test(n.prop))
      if (custom.length && rule.selectors.every(isRootOrTheme)) {
        const kept = rule.clone({ nodes: [] })
        kept.raws.pbScoped = true
        custom.forEach((d) => { d.remove(); kept.append(d) })
        rule.before(kept)
        if (!rule.nodes.length) { rule.remove(); return }
      }
      rule.selectors = rule.selectors.flatMap((s) => scopeSelector(s))
      rule.raws.pbScoped = true
    }
  }
}
scopePlugin.postcss = true

/** The pass over one stylesheet's text (synchronous: the plugin is). */
export function scopeCss(css) {
  return postcss([scopePlugin()]).process(css, { from: undefined }).css
}

/** Vite plugin: rewrite every emitted .css asset after Orca's own CSS pipeline. */
export function viteScopeCss() {
  return {
    name: 'pb-orca-scope-css',
    enforce: 'post',
    generateBundle(_out, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'asset' && file.fileName.endsWith('.css')) file.source = scopeCss(String(file.source))
      }
    }
  }
}
