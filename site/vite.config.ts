import tailwindcss from '@tailwindcss/vite';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';

export default defineConfig({
  base: './',
  plugins: [tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        landing: fileURLToPath(new URL('./index.html', import.meta.url)),
        docs: fileURLToPath(new URL('./docs/index.html', import.meta.url)),
      },
      output: {
        entryFileNames: 'assets/site.js',
        chunkFileNames: 'assets/main.js',
        assetFileNames(asset) {
          return asset.names.some((name) => name.endsWith('.css'))
            ? 'assets/site.css'
            : 'assets/[name][extname]';
        },
      },
    },
  },
});
