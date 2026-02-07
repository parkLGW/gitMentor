import react from '@vitejs/plugin-react'
import path from 'path'

export default {
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve('./src'),
      // 解决 cytoscape 导入问题
      'cytoscape/dist/cytoscape.umd.js': 'cytoscape',
    },
  },
  optimizeDeps: {
    include: ['mermaid', 'cytoscape'],
  },
  build: {
    outDir: 'dist',
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true,
    },
    rollupOptions: {
      input: {
        popup: path.resolve('./src/popup/index.html'),
        'content-script': path.resolve('./src/content/content-script.ts'),
        'service-worker': path.resolve('./src/background/service-worker.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          // Keep content-script and service-worker at root
          if (chunkInfo.name === 'content-script' || chunkInfo.name === 'service-worker') {
            return '[name].js';
          }
          return 'src/popup/[name].js';
        },
        chunkFileNames: '[name].js',
        assetFileNames: (assetInfo) => {
          // Keep popup.html at the correct path
          if (assetInfo.name === 'index.html') {
            return 'src/popup/[name][extname]';
          }
          return '[name][extname]';
        }
      }
    }
  },
  server: {
    port: 5173,
    strictPort: false
  }
}
