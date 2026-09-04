import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';
import frame from '../../src/index.js';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [vue(), frame()],
});
