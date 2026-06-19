import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Базовий шлях для деплою — важливо для Telegram Web App
  // Якщо деплоїш у підпапку, вкажи тут, наприклад: base: '/skillswap/'
  base: '/',

  server: {
  port: 5173,
  allowedHosts: ['http://13.60.49.244:5173/'],  // ← add this line
  proxy: {
    '/api': {
      target: 'http://localhost:8000',
      changeOrigin: true,
      },
    },
  },

  build: {
    // Папка виводу — те що деплоїш на сервер
    outDir: 'dist',
    sourcemap: false,
  },
})
