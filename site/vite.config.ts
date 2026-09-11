import tailwindcss from '@tailwindcss/vite';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';

export default defineConfig({
  base: './',
  plugins: [tailwindcss()],
  build: {
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        landing: fileURLToPath(new URL('./index.html', import.meta.url)),
        main: fileURLToPath(new URL('./docs/index.html', import.meta.url)),
      },
      output: {
        // Pages replaces the deployment, so cached HTML needs stable asset URLs.
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/chunks/[name].js',
        assetFileNames(asset) {
          return asset.names.some((name) => name.endsWith('.css'))
            ? 'assets/site.css'
            : 'assets/[name][extname]';
        },
      },
    },
  },
});
