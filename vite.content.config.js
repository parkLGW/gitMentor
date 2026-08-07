import path from 'path'

// The content script is built separately because it is the one bundle that must
// not be an ES module: MV3 loads content scripts as classic scripts, so an
// `import` at the top level makes the whole script fail to evaluate — silently,
// with no sign of it on the page.
//
// Rollup's output format is per-build rather than per-entry, so this cannot live
// in the main config alongside the popup (which needs code splitting) and the
// service worker (which is declared `type: module`).
export default {
  resolve: {
    alias: {
      '@': path.resolve('./src'),
    },
  },
  // The main build already copied public/ into dist. Copying it a second time
  // would write those files over the first build's output — which is exactly
  // what a stale public/service-worker.js did to the real bundle.
  publicDir: false,
  build: {
    outDir: 'dist',
    // The main build runs first and owns clearing dist
    emptyOutDir: false,
    lib: {
      entry: path.resolve('./src/content/content-script.ts'),
      formats: ['iife'],
      name: 'GitMentorContentScript',
      fileName: () => 'content-script.js',
    },
  },
}
