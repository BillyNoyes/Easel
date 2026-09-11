import {defineConfig} from 'vite';
import easel from '__EASEL_IMPORT__';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [easel()],
});
