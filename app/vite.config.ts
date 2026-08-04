import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/**
 * Убрать из офлайн-файла ссылки на соседние файлы (манифест и значок приложения).
 * Файл открывают двойным щелчком по file:// — рядом с ним ничего нет, и каждая
 * такая ссылка была бы неудавшейся загрузкой. Всё нужное вшито прямо в разметку.
 */
function stripOnlineLinks(): Plugin {
  return {
    name: 'flops-strip-online-links',
    enforce: 'post',
    transformIndexHtml(html) {
      return html
        .replace(/\s*<link rel="manifest"[^>]*>/g, '')
        .replace(/\s*<link rel="apple-touch-icon"[^>]*>/g, '')
    },
  }
}

// Две сборки из одного исходника, как и в первой версии:
//   npm run build           — онлайн-версия (GitHub Pages), обычные чанки
//   npm run build:offline   — один самодостаточный HTML-файл без внешних загрузок
// base './' обязателен: страница живёт в подкаталоге Pages и должна открываться по file://
export default defineConfig(({ mode }) => ({
  base: './',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // В офлайн-сборке public/ не копируем: служебный работник, манифест и значки
  // относятся к онлайн-версии, а сам файл обязан быть самодостаточным
  // (значок и шрифты вшиты строкой прямо в разметку и стили).
  publicDir: mode === 'offline' ? false : 'public',
  plugins: [
    react(),
    tailwindcss(),
    ...(mode === 'offline' ? [viteSingleFile(), stripOnlineLinks()] : []),
  ],
  build: mode === 'offline' ? { outDir: 'dist-offline' } : { outDir: 'dist' },
}))
