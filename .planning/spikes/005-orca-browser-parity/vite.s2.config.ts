// Spike 005: Orca's own web config, in library mode, for the S2 host bundle.
// build-s2-host.sh copies this file beside orca/vite.web.config.ts (untracked
// there) and runs Orca's Vite with --config. Orca's config is imported, never
// edited. mergeConfig cannot drop the base HTML input, so the build block is
// rebuilt from the base one instead.
import { resolve } from 'node:path'
import { defineConfig, type UserConfig } from 'vite'
import base from './vite.web.config'

const { build, ...rest } = base as UserConfig

export default defineConfig({
  ...rest,
  cacheDir: resolve('.cache/vite/pb-s2'),
  define: { ...rest.define, 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    ...build,
    outDir: resolve('out/web/assets/pb-s2'),
    emptyOutDir: false,
    rollupOptions: {},
    lib: {
      entry: resolve('src/renderer/src/web/pb-s2-host.ts'),
      formats: ['iife'],
      name: 'PbS2',
      fileName: () => 'pb-s2-host.js'
    }
  }
})
