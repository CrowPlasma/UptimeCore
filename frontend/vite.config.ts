import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Evita que Vite ejecute location.reload() cuando el navegador suspende la pestaña en segundo plano
// y reconecta el WebSocket de HMR de forma silenciosa al volver a la pestaña.
function preventBackgroundTabReload() {
  return {
    name: 'prevent-background-tab-reload',
    transform(code: string, id: string) {
      if (id.includes('vite/dist/client/client.mjs')) {
        return code.replace(
          /await waitForSuccessfulPing\(url\.href\);\s*location\.reload\(\);/g,
          'await waitForSuccessfulPing(url.href); transport.connect(createHMRHandler(handleMessage));'
        )
      }
      return null
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [preventBackgroundTabReload(), react()],
  server: {
    host: '0.0.0.0',
    hmr: {
      timeout: 300000,
    },
    watch: {
      usePolling: true,
      interval: 1000,
      ignored: ['**/node_modules/**', '**/.git/**'],
    },
    port: 5173,
    proxy: {
      // Proxy API calls to backend Go server
      '/api': {
        target: 'http://backend:8080',
        changeOrigin: true,
        ws: true,
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
})
