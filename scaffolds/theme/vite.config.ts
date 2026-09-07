import {defineConfig} from 'vite';
import frame from '__FRAME_IMPORT__';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [frame()],
});
