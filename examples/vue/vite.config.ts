import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';
import easel from 'vite-plugin-shopify-easel';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [vue(), easel()],
});
