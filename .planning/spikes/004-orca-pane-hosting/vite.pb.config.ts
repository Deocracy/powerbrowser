// Spike 004 (P61-12, assumption A1): a PB-added Vite config. build-pb-entry.sh copies it into
// orca/ beside vite.web.config.ts (the spike directory has no node_modules to resolve vite from)
// and passes it with --config. Orca's own config is imported, never edited.
// Serves the standalone pane page and Routes B and B'.
//
// The page is emitted as out/web/assets/pb/pb-pane.html, not out/web/pb-pane.html: orcad's static
// handler serves /web-index.html and the /assets/, /cmaps/, /standard_fonts/ and /wasm/ subtrees
// only (orca/src/main/runtime/rpc/static-web-client-handler.ts), so a second page beside
// web-index.html answers 404. Under /assets/ it is served with no Orca edit.
import { resolve } from 'node:path'
import { mergeConfig } from 'vite'
import base from './vite.web.config'

export default mergeConfig(base, {
  build: {
    // Orca's page stays beside ours: its build is not wiped.
    emptyOutDir: false,
    rollupOptions: {
      // mergeConfig replaces a string input with this object, so Orca's entry is named again.
      input: {
        'web-index': resolve('src/renderer/web-index.html'),
        'pb-pane': resolve('src/renderer/assets/pb/pb-pane.html')
      }
    }
  }
})
