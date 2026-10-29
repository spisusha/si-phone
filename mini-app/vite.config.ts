import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Версия сайта из package.json — видна внизу профиля
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // Отзывы локально: /api/reviews отдаёт бот (на сайте это делает functions/api/reviews/[[path]].ts).
  // По умолчанию — выложенный бот; REVIEWS_API=http://127.0.0.1:8787 — бот, запущенный рядом (wrangler dev).
  server: {
    proxy: {
      '/api/reviews': {
        target: process.env.REVIEWS_API || 'https://si-phone-bot.spisusha.workers.dev',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/reviews/, '/reviews'),
      },
    },
  },
})
