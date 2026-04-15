import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// =============================================================================
// ⚠️  PROXY LOCAL — Sprint 3 RBAC (2026-04-14)
// Durante el desarrollo del frontend multi-rol, el proxy apunta al backend
// Express que corre en http://localhost:3000 contra la DB local
// `galeria_3d_local`. Antes del merge a main / deploy a prod:
//   1) Volver `target` a 'https://ceopacademia.org'
//   2) Volver `secure` a true
// Ver: docs/session-logs/2026-04-14.md
// =============================================================================
const API_TARGET = 'http://localhost:3000'
const API_SECURE = false

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
