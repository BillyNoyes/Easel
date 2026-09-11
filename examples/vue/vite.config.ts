import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';
import easel from '../../src/index.js';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [vue(), easel()],
});
