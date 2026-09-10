import {defineConfig} from 'vite';
import easel from '../../src/index.js';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [
    easel({
      bundles: {
        theme: {script: 'main.ts', style: 'style.css'},
        announcement: {script: 'announcement.ts'},
      },
    }),
  ],
  build: {assetsInlineLimit: 0},
});
