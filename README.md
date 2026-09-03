# Frame

Frame is a Vite build adapter for Shopify Liquid themes.

Vite builds frontend assets. Frame adapts them to Shopify’s theme structure. Shopify CLI remains independently responsible for theme development, synchronization, previews, and deployment.

## Status

Frame is an early prototype. Its API and generated output format are not stable.

## Default theme structure

Frame assumes the project root is already a Shopify theme. It does not require an additional `theme/` directory.

```text
.
├── assets/
├── blocks/
├── config/
├── layout/
├── locales/
├── sections/
├── snippets/
├── src/
│   ├── main.ts
│   └── style.css
├── templates/
└── vite.config.ts
```

`src/main.js` can be used instead of `src/main.ts`. Vite transpiles JavaScript and TypeScript without additional Frame configuration. TypeScript transpilation does not perform type checking; projects should run `tsc --noEmit` separately when type checking is required.

## Vite configuration

```ts
import {defineConfig} from 'vite';
import frame from '@blueprint/frame';

export default defineConfig({
  plugins: [frame()],
});
```

The default bundle combines `src/main.ts` or `src/main.js` with `src/style.css`. Production output is written into the root-level Shopify `assets/` directory.

Frame generates `snippets/frame-assets.liquid`. Add it to the consuming theme’s `.gitignore` and render it from the layout:

```liquid
{% render 'frame-assets' %}
```

## Commands

Run Vite and Shopify CLI independently. Pass Frame’s refresh signal to Shopify CLI so a Liquid change reloads only after Shopify finishes processing it:

```sh
npm run dev
shopify theme dev --notify .frame/shopify-ready
```

Vite handles JavaScript, TypeScript, and CSS HMR. Shopify CLI handles Liquid and other theme files. Frame watches the notification file and combines repeated notifications into one full-page refresh.

Build before using Shopify CLI to deploy or package the theme:

```sh
npm run build
shopify theme push
```

Frame does not launch or wrap Shopify CLI.

## Custom source and bundles

Frame deliberately uses option names that are independent of Volt’s plugin API.

```ts
frame({
  theme: '.',
  source: 'resources',
  bundles: {
    theme: {
      script: 'storefront.ts',
      style: 'storefront.css',
    },
    product: {
      script: 'product.ts',
      style: 'product.css',
    },
  },
  liquid: 'frame-assets.liquid',
  prefix: 'frame-',
  refresh: {
    signal: '.frame/shopify-ready',
    delay: 100,
  },
});
```

The `theme` path and `source` path resolve relative to Vite’s root. Bundle files resolve relative to `source`. Frame allows source code outside the Shopify theme while constraining generated output to the validated theme path.

The script and stylesheet names are fully configurable. A bundle can include either file independently or combine both under one public entry name.

Render a non-default bundle by name:

```liquid
{% render 'frame-assets', entry: 'product' %}
```

## Generated output safety

Frame builds into `.frame/build` before copying files into the Shopify theme. It stores an ownership ledger at `.frame/outputs.json` and removes only stale files recorded in the previous successful ledger.

Frame refuses to overwrite an existing asset or Liquid snippet that it cannot identify as Frame-owned.

Cleanup is built into production builds. No separate clean plugin is required. Frame removes only stale files from the previous successful ownership ledger and never empties Shopify’s shared `assets/` directory.

## Refresh configuration

Shopify-aware refresh is enabled by default with `.frame/shopify-ready` as its signal file. Disable it with `refresh: false`, or configure its signal and debounce delay through the `refresh` option.

Frame does not directly watch Liquid files. Shopify CLI remains responsible for uploading them, and its notification tells Frame when a browser refresh is safe.

## Frontend ecosystem compatibility

Frame uses Vite’s normal module graph and plugin system rather than providing framework-specific adapters.

- JavaScript and TypeScript are transformed by Vite out of the box.
- Alpine.js works as a normal npm import from a configured script entry.
- Tailwind CSS v4 works through the official `@tailwindcss/vite` plugin.
- React, Vue, Sass, PostCSS, and other integrations should use their normal Vite plugins.

Tailwind must be told where to find any theme files that its automatic source detection does not include. Use Tailwind v4 `@source` directives relative to the stylesheet when explicit Liquid scanning is needed.

Frame’s test suite builds a custom TypeScript entry with Alpine.js 3.16 and Tailwind CSS 4.3, including utility classes discovered in a Shopify section.
