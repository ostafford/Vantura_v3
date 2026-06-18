import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pkg = require('./package.json') as { version: string }

const base = '/Vantura_v3/'

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Disable navigateFallback: workbox requires the fallback URL to exist in precache.
        // With base path, precache has "index.html" (relative to dist) but createHandlerBoundToURL
        // expects an exact match. Disabling lets navigation hit the network; 404.html handles SPA routing.
        navigateFallback: null,
      },
      manifest: {
        name: 'Vantura',
        short_name: 'Vantura',
        description: 'Local-first finance app synced with Up Bank',
        theme_color: '#1a142d',
        background_color: '#1a142d',
        display: 'standalone',
        icons: [
          {
            src: `${base}images/pwa-192.png`,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: `${base}images/pwa-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
