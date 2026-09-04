import {defineConfig} from 'vite';
import frame from '../../src/index.js';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [
    frame({
      bundles: {
        theme: {script: 'main.ts', style: 'style.css'},
        announcement: {script: 'announcement.ts'},
      },
    }),
  ],
  build: {assetsInlineLimit: 0},
});
