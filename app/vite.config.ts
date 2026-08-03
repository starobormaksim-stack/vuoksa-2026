import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Две сборки из одного исходника, как и в первой версии PackFlow:
//   npm run build            — онлайн-версия (GitHub Pages), обычные чанки
//   npm run build -- --mode offline — один самодостаточный HTML-файл без внешних загрузок
// base './' обязателен: страница живёт в подкаталоге Pages и должна открываться по file://
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), tailwindcss(), ...(mode === 'offline' ? [viteSingleFile()] : [])],
  build: mode === 'offline' ? { outDir: 'dist-offline' } : { outDir: 'dist' },
}))
