/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    env: {
      // Matches src/test/handlers.ts's API_BASE_URL.
      VITE_API_URL: 'http://api.test',
    },
  },
})
