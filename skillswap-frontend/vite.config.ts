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
    // host: true — слухати на 0.0.0.0, а не лише localhost, інакше ngrok/
    // cloudflare тунель не може достукатись до dev-сервера ззовні контейнера/VM.
    host: true,
    // Vite 5+ за замовчуванням блокує запити з невідомим Host-заголовком
    // (захист від DNS rebinding) — саме це й давало 403 "Blocked request.
    // This host is not allowed" для ngrok/trycloudflare доменів.
    // true вимикає перевірку повністю (ОК для тестового тунелю; для прод
    // деплою краще перелічити конкретні домени масивом замість true).
    allowedHosts: true,
    // Проксі для локальної розробки — щоб уникнути CORS при запитах до бекенду
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
