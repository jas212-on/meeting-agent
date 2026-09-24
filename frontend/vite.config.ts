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
        target: 'https://datebook-tribunal-smite.ngrok-free.dev',
        changeOrigin: true,
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
      },
      '/control': {
        target: 'http://127.0.0.1:4712',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/control/, ''),
      },
    },
  },
})
