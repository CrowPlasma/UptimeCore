import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    watch: {
      usePolling: true
    },
    port: 5173,
    proxy: {
      // Proxy API calls to backend Go server
      '/api': {
        target: 'http://backend:8080',
        changeOrigin: true,
      },
    },
  },
})
