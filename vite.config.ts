import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,   // ← add this
    proxy: {
      '/api/search': {
        target: 'https://api.1mg.com',
        changeOrigin: true,
        rewrite: (path) => path.replace('/api/search', '/api/v4/search/autocomplete'),
      },
      '/api/cart': {
        target: 'https://api.thewellnesscorner.com',
        changeOrigin: true,
        rewrite: (path) => path.replace('/api/cart', '/store/tata-1mg/cart'),
      },
      '/img': {
        target: 'https://onemg.gumlet.io',
        changeOrigin: true,
        rewrite: (path) => path.replace('/img', ''),
      },
    },
  },
})