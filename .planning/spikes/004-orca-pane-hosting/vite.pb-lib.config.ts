// Spike 004 (P61-12, assumption A4): the Route A library bundle. One classic script
// (iife, global PbPane) that carries no React of its own: react, react-dom, react-dom/client and
// react/jsx-runtime resolve to members of window.__pbReact, which the Theia frame fills from its
// own React 19.2.8. Emitted under out/web/assets/ because orcad serves nothing else (see
// vite.pb.config.ts). PB_LIB_TWO_COPY=1 drops the externals and writes outside orca/ (the control).
import { resolve } from 'node:path'
import { mergeConfig } from 'vite'
import base from './vite.web.config'

const twoCopy = process.env.PB_LIB_TWO_COPY === '1'
const entry = resolve('src/renderer/src/pb/pb-pane-mount.tsx')

export default mergeConfig(base, {
  // Library mode leaves process.env.NODE_ENV for the consumer; a classic script has no consumer.
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    emptyOutDir: false,
    outDir: twoCopy ? resolve('..', '.mozbuild', 'p61-01', 'pb-lib-two-copy') : resolve('out/web/assets/pb-lib'),
    lib: {
      entry,
      formats: ['iife'],
      name: 'PbPane',
      fileName: () => 'pb-pane-lib.js',
      cssFileName: 'pb-pane-lib'
    },
    rollupOptions: {
      // rollupOptions.input wins over lib.entry, and the base config names web-index.html.
      input: entry,
      external: twoCopy ? [] : ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
      output: {
        globals: {
          react: '__pbReact.React',
          'react-dom': '__pbReact.ReactDOM',
          'react-dom/client': '__pbReact.ReactDOMClient',
          'react/jsx-runtime': '__pbReact.jsxRuntime'
        }
      }
    }
  }
})
