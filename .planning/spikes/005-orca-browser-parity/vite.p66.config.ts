// Phase 66 research gate: Orca's own web config, library mode, for the thin-host probe bundle.
// build-p66-thin-host.sh copies this file beside orca/vite.web.config.ts (untracked
// there) and runs Orca's Vite with --config. Orca's config is imported, never
// edited. mergeConfig cannot drop the base HTML input, so the build block is
// rebuilt from the base one instead.
import { resolve } from 'node:path'
import { defineConfig, type UserConfig } from 'vite'
import base from './vite.web.config'

const { build, ...rest } = base as UserConfig

export default defineConfig({
  ...rest,
  cacheDir: resolve('.cache/vite/pb-p66'),
  define: { ...rest.define, 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    ...build,
    outDir: resolve('out/web/assets/pb-p66'),
    emptyOutDir: false,
    rollupOptions: {},
    lib: {
      entry: resolve('src/renderer/src/web/pb-p66-thin-host.ts'),
      formats: ['iife'],
      name: 'PbThin',
      fileName: () => 'pb-p66-thin-host.js'
    }
  }
})
