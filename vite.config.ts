import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    proxy: {
      '/api': {
        target: 'https://ceopacademia.org',
        changeOrigin: true,
        secure: true,
      },
      '/cdn': {
        target: 'https://ceopacademia.org',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
