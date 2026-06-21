import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pkg = require('./package.json') as { version: string }

const base = '/'

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
        // Serve index.html from the SW precache for all SPA navigation requests.
        // Must use the full base-prefixed path so Workbox finds it in the precache manifest.
        // This eliminates the 404 console error caused by navigation requests hitting GitHub Pages
        // for sub-routes (/settings, /transactions, etc.) when the SW is active.
        // The 404.html in CI remains as a fallback for first-load before the SW installs.
        navigateFallback: `${base}index.html`,
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
