import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 1mg search & autocomplete
      '/pwa-dweb-api': {
        target: 'https://www.1mg.com',
        changeOrigin: true,
        secure: true,
      },
      
      // Wellness Corner cart (api.thewellnesscorner.com)
      '/api': {
        target: 'https://wellness-liard-nine.vercel.app',  // ← your Vercel deployment
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
