import tailwindcss from '@tailwindcss/vite';
import {defineConfig} from 'vite';
import easel from '../../src/index.js';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [tailwindcss(), easel()],
});
