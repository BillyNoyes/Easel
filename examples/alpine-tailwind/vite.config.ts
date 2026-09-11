import tailwindcss from '@tailwindcss/vite';
import {defineConfig} from 'vite';
import easel from 'vite-plugin-shopify-easel';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [tailwindcss(), easel()],
});
