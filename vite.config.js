import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// 設定メニューに出すバージョン（package.json の version）と、作った日時
const appVersion =
  JSON.parse(
    readFileSync(
      new URL('./package.json', import.meta.url),
      'utf8'
    )
  ).version

export default defineConfig({
  base: '/manga-manager-pwa/',
  define: {
    'import.meta.env.VITE_APP_VERSION':
      JSON.stringify(appVersion),
    'import.meta.env.VITE_BUILD_TIME':
      JSON.stringify(new Date().toISOString())
  },
  plugins: [
    react(),

    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '漫画管理',
        short_name: '漫画管理',
        description: '漫画雑誌と連載作品の読了管理アプリ',
        theme_color: '#111827',
        background_color: '#111827',
        display: 'standalone',
        start_url: '/manga-manager-pwa/',
        scope: '/manga-manager-pwa/',
        icons: [
          {
            src: '/manga-manager-pwa/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/manga-manager-pwa/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ]
})
