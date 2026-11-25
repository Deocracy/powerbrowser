// Phase 64 research probe (P64-14): scope Orca's built stylesheet to the pane roots and to Orca's
// body-level Radix portal roots. A PostCSS plugin run over the emitted CSS (generateBundle), so it
// sees Tailwind's final output, not main.css.
//
//   bare html / :root / body / :host       -> S                (the scope roots themselves)
//   qualified root (:root.dark, html[x],
//     body[data-modal-overlay-open])       -> <that root> S    (Orca's own html/body state stays an
//                                                               ancestor condition)
//   leading .dark / .light compound        -> .dark S ...       (theme class on <html>, as Orca sets it)
//   anything else X                        -> S X, X:where(P)   (descendants, plus the portal root itself)
//   inside @keyframes                      -> untouched
//
// S = :where(<pane root>, P);  P = body > [data-radix-popper-content-wrapper], body > [data-slot]
// (Radix portals use asChild: the body-level node is the popper wrapper or the shadcn content/overlay
// node, react-dialog/dist/index.mjs:84-88, react-popper/dist/index.mjs:200.)
import postcss from 'postcss'

export const PANE_ROOT = '[data-pb-pane-root]'
export const PORTAL_ROOTS = 'body > [data-radix-popper-content-wrapper], body > [data-slot]'

const ROOT_RE = /^(html|:root|body|:host)(?![\w-])/
const THEME_RE = /^\.(dark|light)(?![\w-])/

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

export function scopeSelector(selector, { paneRoot = PANE_ROOT, portalRoots = PORTAL_ROOTS } = {}) {
  const S = `:where(${paneRoot}, ${portalRoots})`
  const sel = selector.trim()
  const [head, rest] = firstCompound(sel)
  const root = ROOT_RE.exec(head)
  if (root) {
    const qualifiers = head.slice(root[0].length)
    if (!qualifiers) {
      return [`${S}${rest}`]
    }
    // A qualified root stays an ancestor condition; a following bare body/html is the scope root.
    const body = /^(\s+|\s*>\s*)(body|html)(?![\w-])/.exec(rest)
    return [body ? `${head} ${S}${rest.slice(body[0].length)}` : `${head} ${S}${rest}`]
  }
  if (THEME_RE.test(head)) {
    return [`${head} ${S}${rest}`.trim()]
  }
  // The portal root itself; a pseudo-element must stay last, so the condition goes before it.
  const pseudo = /(::[\w-]+(?:\([^)]*\))?)$/.exec(sel)
  const self = pseudo ? `${sel.slice(0, pseudo.index)}:where(${portalRoots})${pseudo[1]}` : `${sel}:where(${portalRoots})`
  return [`${S} ${sel}`, self]
}

export function scopePlugin(options = {}) {
  const paneRoot = options.paneRoot ?? PANE_ROOT
  const portalRoots = options.portalRoots ?? PORTAL_ROOTS
  const isRootOrTheme = (sel) => {
    const [head] = firstCompound(sel.trim())
    return ROOT_RE.test(head) || THEME_RE.test(head)
  }
  return {
    postcssPlugin: 'pb-orca-scope',
    Once(root) {
      // Inherited values the standalone page takes from the browser's defaults on <html>, which a
      // pane would otherwise inherit from Theia's body (measured: font-size 13px, not 16px).
      // The pane root is PB's widget node, which Theia's own class rules also size: the reset must
      // win there (measured: a zero-specificity reset left 13px). Portal roots are plain body
      // children whose own Orca classes must still win, so their reset stays at zero specificity.
      const paneReset = postcss.rule({ selector: paneRoot, nodes: [postcss.decl({ prop: 'font-size', value: 'medium', important: true })] })
      const portalReset = postcss.rule({ selector: `:where(${portalRoots})`, nodes: [postcss.decl({ prop: 'font-size', value: 'medium' })] })
      paneReset.__pbScoped = portalReset.__pbScoped = true
      root.prepend(paneReset, portalReset)
    },
    Rule(rule) {
      if (rule.__pbScoped) return
      for (let p = rule.parent; p; p = p.parent) {
        if (p.type === 'atrule' && /keyframes$/i.test(p.name)) return
      }
      // Orca's appearance code writes theme tokens to <html>'s inline style and its class; custom
      // properties declared by root/theme rules therefore stay on the document root, unscoped, so
      // those runtime writes keep winning as they do in Orca (a scoped copy would shadow them).
      const custom = rule.nodes.filter((n) => n.type === 'decl' && n.prop.startsWith('--'))
      if (custom.length && rule.selectors.every(isRootOrTheme)) {
        const kept = rule.clone({ nodes: [] })
        kept.__pbScoped = true
        custom.forEach((d) => { d.remove(); kept.append(d) })
        rule.before(kept)
        if (!rule.nodes.length) { rule.remove(); return }
      }
      rule.selectors = rule.selectors.flatMap((s) => scopeSelector(s, { paneRoot, portalRoots }))
      rule.__pbScoped = true
    }
  }
}
scopePlugin.postcss = true

/** Optional second pass: lift @layer blocks so Orca's rules are unlayered like Theia's. */
export function unlayerPlugin() {
  return {
    postcssPlugin: 'pb-orca-unlayer',
    AtRuleExit: {
      layer(atRule) {
        if (atRule.nodes) atRule.replaceWith(atRule.nodes)
        else atRule.remove()
      }
    }
  }
}
unlayerPlugin.postcss = true

export async function scopeCss(css, { unlayer = false, ...options } = {}) {
  const plugins = [scopePlugin(options), ...(unlayer ? [unlayerPlugin()] : [])]
  return (await postcss(plugins).process(css, { from: undefined })).css
}

/** Vite plugin: rewrite every emitted .css asset. */
export function viteScopeCss(options = {}) {
  return {
    name: 'pb-orca-scope-css',
    enforce: 'post',
    async generateBundle(_out, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'asset' && file.fileName.endsWith('.css')) {
          file.source = await scopeCss(String(file.source), options)
        }
      }
    }
  }
}
