// PowerBrowser overlay file (Phase 64, P64-04, P64-08, P64-09, P64-24; 64-RESEARCH A2): the pane
// bundle's build, run by scripts/build-orca-panes.sh as
//   node node_modules/vite/bin/vite.js build --config vite.pb-panes.config.ts
// beside Orca's own vite.web.config.ts, which it extends. An app-mode ES build, never build.lib:
// Vite 8 inlines every asset in library mode. Output: out/web/assets/pb-panes/pb-panes.js (the
// entry, ES module), pb-panes.css (one sheet) and every other emitted file, by relative URL.
//
// React: the bundle ships none. react, react-dom, react-dom/client and react/jsx-runtime resolve
// to virtual modules that read globalThis[Symbol.for('powerbrowser.orca-panes.react')], which the
// host (Theia's orca-panes) sets before it imports the entry. Their export names are read here, at
// build time, from Orca's own React under orca/node_modules (19.2.8, the version Theia ships), so
// the Orca build needs no Theia install; PB_HOST_REACT_DIR (a node_modules directory) overrides
// it. The emitted sheet is scoped to the pane by pb-css-scope.mjs (64-RESEARCH A3).
// PB_PANES_STANDALONE=1 bundles Orca's React instead (the standalone page and the two-copy
// control); PB_PANES_OUT then names the output directory.
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { mergeConfig } from 'vite'
import base from './vite.web.config'
import { PB_OVERLAY_MARKER as SCOPE_MARKER, viteScopeCss } from './pb-css-scope.mjs'

const CONFIG_MARKER = 'pb-overlay:vite.pb-panes.config.ts'
const KEY = 'powerbrowser.orca-panes.react'
const MODULES: Record<string, string> = {
  react: 'React',
  'react-dom': 'ReactDOM',
  'react-dom/client': 'ReactDOMClient',
  'react/jsx-runtime': 'jsxRuntime'
}
const REACT_PREFIX = '\0pb-host-react:'
const MARKERS_ID = 'virtual:pb-panes-markers'
const standalone = process.env.PB_PANES_STANDALONE === '1'

function hostReact() {
  const hostDir = resolve(process.env.PB_HOST_REACT_DIR || 'node_modules')
  const hostRequire = createRequire(resolve(hostDir, 'package.json'))
  return {
    name: 'pb-host-react',
    enforce: 'pre' as const,
    resolveId(id: string) {
      return Object.prototype.hasOwnProperty.call(MODULES, id) ? REACT_PREFIX + id : null
    },
    load(id: string) {
      if (!id.startsWith(REACT_PREFIX)) return null
      const spec = id.slice(REACT_PREFIX.length)
      const names = Object.keys(hostRequire(spec)).filter((n) => /^[A-Za-z_$][\w$]*$/.test(n) && n !== 'default')
      return [
        `const host = globalThis[Symbol.for(${JSON.stringify(KEY)})];`,
        `if (!host || !host.${MODULES[spec]}) throw new Error('orca pane bundle: no React hand-off at Symbol.for(${KEY})');`,
        `const m = host.${MODULES[spec]};`,
        'export default m;',
        ...names.map((n) => `export const ${n} = m[${JSON.stringify(n)}];`)
      ].join('\n')
    }
  }
}

/**
 * Serves PB_CONFIG_MARKERS, so this file's marker (and the scoping pass's) reaches the built .js
 * (orca-overlay-built), and repeats them in a comment at the top of pb-panes.js: Rolldown makes the
 * entry a re-export facade, so the code holding the literals sits in a chunk under assets/.
 */
function markers(extra: string[]) {
  const list = [CONFIG_MARKER, ...extra]
  return {
    name: 'pb-panes-markers',
    // After minification (which drops comments), so the comment stays.
    generateBundle(_options: unknown, bundle: Record<string, { type: string; isEntry?: boolean; code?: string }>) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'chunk' && chunk.isEntry) chunk.code = `/* PB_OVERLAY_BUILD ${JSON.stringify(list)} */\n${chunk.code}`
      }
    },
    resolveId(id: string) {
      return id === MARKERS_ID ? '\0' + MARKERS_ID : null
    },
    load(id: string) {
      return id === '\0' + MARKERS_ID
        ? `export const PB_CONFIG_MARKERS = ${JSON.stringify(list)};`
        : null
    }
  }
}

export default mergeConfig(base, {
  base: './',
  plugins: [...(standalone ? [] : [hostReact()]), markers([SCOPE_MARKER]), viteScopeCss()],
  build: {
    emptyOutDir: true,
    outDir: resolve(process.env.PB_PANES_OUT || 'out/web/assets/pb-panes'),
    cssCodeSplit: false,
    // No <link rel=modulepreload> per dynamic import: the host imports the entry with no HTML preload links, so the
    // helper linked deps the entry had already imported, and Gecko fires 'error' on a modulepreload whose module is in
    // the module map (169 at first boot, gate 2026-11-17). The bundle is served on loopback; preloading buys nothing.
    modulePreload: false,
    rollupOptions: {
      input: { 'pb-panes': resolve('src/renderer/src/pb/pb-pane-mount.tsx') },
      preserveEntrySignatures: 'exports-only',
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        assetFileNames: (info: { names?: string[]; name?: string }) =>
          (info.names?.[0] ?? info.name ?? '').endsWith('.css') ? 'pb-panes.css' : 'assets/[name]-[hash][extname]'
      }
    }
  }
})
