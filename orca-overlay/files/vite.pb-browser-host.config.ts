// PowerBrowser overlay file (Phase 66, BRW-03; P66-02, P66-30): the thin browser host's build, run by
// scripts/build-orca-browser-host.sh as
//   node node_modules/vite/bin/vite.js build --config vite.pb-browser-host.config.ts
// beside Orca's own vite.web.config.ts, whose aliases and defines it reuses (imported, never edited). Orca's
// plugins (React, Tailwind, the pdf.js asset copy) are left out: the host has no JSX, no CSS and no asset, and the
// asset copy would write into the served directory.
// A library build of src/renderer/src/pb/browser-host/pb-browser-host.ts: one ES file, pb-browser-host.js, no code
// splitting, minify off so names and markers survive. The thin host imports no asset, so lib mode inlines nothing
// (orca-browser-host-bundle's data: URL clause proves it).
//
// PB_BROWSER_HOST_OUT names the output directory (the pane bundle's, set by the build script); emptyOutDir is off
// because pb-panes.js lives there too. PB_BROWSER_HOST_META names an ignored directory outside the served one, where
// the plugin writes modules.json (every module id of the graph, for the import-graph clause). The plugin also
// prepends a comment listing every pb-overlay marker found in a compiled module's source, this file's included, so
// orca-overlay-built finds each marker in the emitted .js.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { defineConfig, type UserConfig } from 'vite'
import base from './vite.web.config'

const CONFIG_MARKER = 'pb-overlay:vite.pb-browser-host.config.ts'
const MARKER = /pb-overlay:[A-Za-z0-9._/-]+/g
const ENTRY = resolve('src/renderer/src/pb/browser-host/pb-browser-host.ts')
const OUT = process.env.PB_BROWSER_HOST_OUT
const META = resolve(process.env.PB_BROWSER_HOST_META || 'out/pb-browser-host-meta')
if (!OUT) throw new Error('vite.pb-browser-host.config.ts: PB_BROWSER_HOST_OUT is not set (run scripts/build-orca-browser-host.sh)')

function hostMeta() {
  const markers = new Set<string>([CONFIG_MARKER])
  const seen = new Set<string>()
  return {
    name: 'pb-browser-host-meta',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      seen.add(id)
      if (!id.includes('/node_modules/')) for (const m of code.match(MARKER) ?? []) markers.add(m)
      return null
    },
    generateBundle(
      this: { getModuleIds?: () => IterableIterator<string> },
      _options: unknown,
      bundle: Record<string, { type: string; isEntry?: boolean; code?: string }>
    ) {
      const ids = [...new Set([...(this.getModuleIds ? [...this.getModuleIds()] : []), ...seen])].sort()
      mkdirSync(META, { recursive: true })
      writeFileSync(join(META, 'modules.json'), `${JSON.stringify(ids, null, 1)}\n`)
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'chunk' && chunk.isEntry) {
          chunk.code = `/* PB_OVERLAY_BUILD ${JSON.stringify([...markers].sort())} */\n${chunk.code}`
        }
      }
    }
  }
}

const { build, plugins: _plugins, ...rest } = base as UserConfig

export default defineConfig({
  ...rest,
  plugins: [hostMeta()],
  cacheDir: resolve('.cache/vite/pb-browser-host'),
  define: { ...rest.define, 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    ...build,
    outDir: resolve(OUT),
    emptyOutDir: false,
    minify: false,
    copyPublicDir: false,
    // The base input is web-index.html; lib mode takes the entry instead.
    rollupOptions: { output: { codeSplitting: false } },
    lib: {
      entry: ENTRY,
      formats: ['es'],
      fileName: () => 'pb-browser-host.js'
    }
  }
})
