import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// =============================================================================
// Proxy de desarrollo — tanto /api como /cdn apuntan a prod (ceopacademia.org).
// El frontend dev consume la API de prod a través de este proxy CORS-friendly.
//
// Si necesitas desarrollar contra el backend LOCAL (`cd backend && node server.js`):
//   - Cambiar API_TARGET a 'http://localhost:3000'
//   - Cambiar API_SECURE a false
//   - NO commitear esos cambios: son solo para tu sesión de dev local
// =============================================================================
const API_TARGET = 'https://ceopacademia.org'
const API_SECURE = true

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        secure: API_SECURE,
      },
      '/cdn': {
        // El CDN (DigitalOcean Spaces) sí sigue contra prod — los modelos .glb
        // y thumbnails están en el mismo bucket dev/prod.
        target: 'https://ceopacademia.org',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
