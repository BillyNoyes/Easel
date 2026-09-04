import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';
import frame from '../../src/index.js';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), frame({bundles: {theme: {script: 'main.tsx', style: 'style.css'}}})],
});
