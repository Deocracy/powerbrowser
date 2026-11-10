// Phase 64 research probe (spike 004 condition 3): the same entry as an app-mode ES build, not a
// library build. Vite 8 inlines every asset in library mode (vite/dist/node/chunks/node.js
// shouldInline: `if (environment.config.build.lib) return true`), which is why the spike bundle is
// 42 MB. Here assets are emitted as files and dynamic imports stay separate chunks. React reaches
// the bundle through virtual modules that read the same Symbol.for key; their named exports are
// derived at build time from the React the host runs (PB_HOST_REACT_DIR, Theia's node_modules).
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { mergeConfig } from 'vite'
import base from './vite.web.config'
import { viteScopeCss } from './pb-css-scope.mjs'

const KEY = 'powerbrowser.orca-panes.react'
const hostDir = process.env.PB_HOST_REACT_DIR
if (!hostDir) throw new Error('PB_HOST_REACT_DIR (the host node_modules holding react) is required')
const hostRequire = createRequire(resolve(hostDir, 'package.json'))
const MODULES: Record<string, string> = { react: 'React', 'react-dom': 'ReactDOM', 'react-dom/client': 'ReactDOMClient', 'react/jsx-runtime': 'jsxRuntime' }
const PREFIX = '\0pb-host-react:'

function hostReact() {
  return {
    name: 'pb-host-react',
    enforce: 'pre' as const,
    resolveId(id: string) {
      return Object.prototype.hasOwnProperty.call(MODULES, id) ? PREFIX + id : null
    },
    load(id: string) {
      if (!id.startsWith(PREFIX)) return null
      const spec = id.slice(PREFIX.length)
      const names = Object.keys(hostRequire(spec)).filter((n) => /^[A-Za-z_$][\w$]*$/.test(n) && n !== 'default')
      return [
        `const host = globalThis[Symbol.for(${JSON.stringify(KEY)})];`,
        `if (!host) throw new Error('orca pane bundle: no React hand-off at Symbol.for(${KEY})');`,
        `const m = host.${MODULES[spec]};`,
        `export default m;`,
        ...names.map((n) => `export const ${n} = m[${JSON.stringify(n)}];`)
      ].join('\n')
    }
  }
}

export default mergeConfig(base, {
  plugins: [hostReact(), viteScopeCss({})],
  build: {
    emptyOutDir: true,
    outDir: resolve(process.env.PB_ESM_OUT ?? 'out/web/assets/pb-esm'),
    rollupOptions: {
      input: { 'pb-probe': resolve('src/renderer/src/pb/pb-probe-mount.tsx') },
      preserveEntrySignatures: 'exports-only',
      output: { format: 'es', entryFileNames: '[name].js' }
    }
  }
})
