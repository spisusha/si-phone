import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Версия сайта из package.json — видна внизу профиля
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
})
