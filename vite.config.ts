import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.png'],
      manifest: {
        name: '个人记账本',
        short_name: '记账本',
        description: '轻量、安全、可云同步的个人记账本',
        theme_color: '#F2F2F7',
        background_color: '#F2F2F7',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'icon.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  base: './', // Ensures assets are loaded correctly on EdgeOne Pages
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/');
          if (!normalizedId.includes('node_modules')) return undefined;
          if (normalizedId.includes('/lucide-react/')) return 'icons-vendor';
          if (
            normalizedId.includes('/recharts/') ||
            normalizedId.includes('/d3-') ||
            normalizedId.includes('/react-is/') ||
            normalizedId.includes('/react-smooth/') ||
            normalizedId.includes('/victory-vendor/')
          ) return 'charts-vendor';
          if (normalizedId.includes('/@capacitor/')) return 'capacitor-vendor';
          if (normalizedId.includes('/dexie/')) return 'storage-vendor';
          if (normalizedId.includes('/date-fns/')) return 'date-vendor';
          if (
            normalizedId.includes('/react/') ||
            normalizedId.includes('/react-dom/') ||
            normalizedId.includes('/scheduler/')
          ) return 'react-vendor';
          return 'vendor';
        }
      }
    }
  },
  server: {
    port: 3000,
    host: true,
    allowedHosts: true
  }
});
