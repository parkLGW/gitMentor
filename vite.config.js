import react from '@vitejs/plugin-react'
import path from 'path'

export default {
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve('./src'),
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: path.resolve('./src/popup/index.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    }
  },
  server: {
    port: 5173,
    strictPort: false
  }
}
