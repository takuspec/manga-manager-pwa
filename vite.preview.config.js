import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({base:'/manga-manager-pwa/',plugins:[react()],build:{outDir:'dist-preview',rollupOptions:{input:'astryx-preview.html'}}})
