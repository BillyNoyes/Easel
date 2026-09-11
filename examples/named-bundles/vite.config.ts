import {defineConfig} from 'vite';
import easel from 'vite-plugin-shopify-easel';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [
    easel({
      bundles: {
        theme: {script: 'main.ts', style: 'style.css'},
        product: {script: 'pages/product.ts', style: 'pages/product.css'},
        collection: {script: 'pages/collection.ts', style: 'pages/collection.css'},
      },
    }),
  ],
});
