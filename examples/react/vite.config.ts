import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';
import easel from '../../src/index.js';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), easel({bundles: {theme: {script: 'main.tsx', style: 'style.css'}}})],
});
