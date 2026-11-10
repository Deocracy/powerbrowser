// Phase 64 research probe: a Route A library bundle (iife) built by Orca's own Vite from a PB-added
// config, with Theia's React read from ONE Symbol.for key on globalThis (P64-08), and the emitted
// stylesheet scoped by pb-css-scope.mjs when PB_SCOPE_CSS=1 (P64-14). build-probe.sh copies this
// beside orca/vite.web.config.ts and passes it with --config.
//   PB_PROBE_TARGET=probe          entry src/pb/pb-probe-mount.tsx -> out/web/assets/pb-probe/ (global PbProbe)
//   PB_PROBE_TARGET=spike-scoped   entry src/pb/pb-pane-mount.tsx  -> out/web/assets/pb-lib/   (global PbPane,
//                                  the file the spike's measure.mjs --measure css loads)
import { resolve } from 'node:path'
import { mergeConfig } from 'vite'
import base from './vite.web.config'
import { viteScopeCss } from './pb-css-scope.mjs'

const target = process.env.PB_PROBE_TARGET ?? 'probe'
const spike = target === 'spike-scoped'
const KEY = 'powerbrowser.orca-panes.react'
// The bundle-local require of the spike (Rolldown intro), reading the one hand-off key.
// The spike-scoped target keeps the spike harness's window.__pbReact, which measure.mjs fills.
const externalRequire = `var __pbHost = ${spike ? 'window.__pbReact' : `globalThis[Symbol.for(${JSON.stringify(KEY)})]`};
if (!__pbHost) throw new Error('orca pane bundle: no React hand-off at Symbol.for(${KEY})');
var require = function (id) {
  var map = { react: __pbHost.React, 'react-dom': __pbHost.ReactDOM, 'react-dom/client': __pbHost.ReactDOMClient, 'react/jsx-runtime': __pbHost.jsxRuntime };
  if (!Object.prototype.hasOwnProperty.call(map, id)) throw new Error('orca pane bundle: require(' + id + ') has no host module');
  return map[id];
};`
const entry = resolve(spike ? 'src/renderer/src/pb/pb-pane-mount.tsx' : 'src/renderer/src/pb/pb-probe-mount.tsx')

export default mergeConfig(base, {
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: process.env.PB_SCOPE_CSS === '1' ? [viteScopeCss({ unlayer: process.env.PB_UNLAYER === '1', ...(process.env.PB_SCOPE_ROOT ? { paneRoot: process.env.PB_SCOPE_ROOT } : {}) })] : [],
  build: {
    emptyOutDir: false,
    outDir: resolve(spike ? 'out/web/assets/pb-lib' : 'out/web/assets/pb-probe'),
    lib: {
      entry,
      formats: ['iife'],
      name: spike ? 'PbPane' : 'PbProbe',
      fileName: () => (spike ? 'pb-pane-lib.js' : 'pb-probe-lib.js'),
      cssFileName: spike ? 'pb-pane-lib' : 'pb-probe-lib'
    },
    rollupOptions: {
      input: entry,
      external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
      output: {
        intro: externalRequire,
        // The iife's arguments are evaluated OUTSIDE the wrapper, where the intro's __pbHost does
        // not exist yet (measured: 'defined no PbPane global'); they must name a real global.
        globals: Object.fromEntries(
          Object.entries({ react: 'React', 'react-dom': 'ReactDOM', 'react-dom/client': 'ReactDOMClient', 'react/jsx-runtime': 'jsxRuntime' })
            .map(([id, member]) => [id, `${spike ? '__pbReact' : '__pbOrcaPanesReact'}.${member}`])
        )
      }
    }
  }
})
