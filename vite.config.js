import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'info',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: '舞昆シフト提出アプリ',
        short_name: 'シフト管理',
        description: '舞昆のこうはら店舗向けシフト管理システム',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // プリキャッシュはHTML, CSS, 画像, フォントのみ（JSは除外）
        // JSをプリキャッシュするとビルドハッシュ不一致で白い画面になる
        globPatterns: ['**/*.{css,html,ico,png,svg,woff2}'],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            // JSファイル - ネットワーク優先（キャッシュフォールバック）
            // これにより、ビルドハッシュが変わっても常に最新のJSを取得
            urlPattern: /\/assets\/.*\.js$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'js-cache',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 24 * 60 * 60 // 24時間
              },
              networkTimeoutSeconds: 3
            }
          },
          {
            // CSSファイル - ネットワーク優先
            urlPattern: /\/assets\/.*\.css$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'css-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 24 * 60 * 60
              },
              networkTimeoutSeconds: 3
            }
          },
          {
            // Supabase API - ネットワーク優先
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60
              },
              networkTimeoutSeconds: 5
            }
          }
        ]
      }
    })
  ],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 3000,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks - split large dependencies
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-charts': ['recharts'],
          'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-select', '@radix-ui/react-tabs', '@radix-ui/react-switch', '@radix-ui/react-popover'],
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          'vendor-date': ['date-fns'],
          'vendor-pdf': ['html2canvas', 'jspdf'],
          'vendor-supabase': ['@supabase/supabase-js'],
        }
      }
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    allowedHosts: true,
  }
})
