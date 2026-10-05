import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_URL || 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/control': {
        target: 'http://127.0.0.1:4712',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/control/, ''),
      },
    },
  },
})
