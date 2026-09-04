# Frame + React

A minimal Shopify Liquid theme using Frame, React 19, and the official React Vite plugin.

React mounts only where Liquid renders `[data-react-counter]` and remounts sections replaced by the Shopify Theme Editor. The entry imports `@vitejs/plugin-react/preamble` so React Fast Refresh works without an HTML entry point.

```sh
npm install
npm run dev
shopify theme dev --notify .frame/shopify-ready
```
