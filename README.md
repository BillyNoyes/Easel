# Frame

Frame is a Vite plugin for Shopify Liquid themes.

It builds JavaScript, TypeScript, and CSS into Shopify theme assets, generates the Liquid snippet that loads them, and safely replaces old build output. During development, it can coordinate Vite updates with Shopify CLI reloads. Shopify CLI still handles previews, syncing, and deployment.

Frame adds no storefront runtime.

> Frame is an early prototype. Its API and generated output may change before the first stable release.

## Install

```sh
pnpm add -D @blueprint/frame vite
```

Frame requires Node.js 22.12 or newer and supports Vite 7 and 8.

## Start

Keep the Shopify theme at the project root and place source files in `src`.

```text
assets/
config/
layout/
sections/
snippets/
templates/
src/
  main.ts
  style.css
vite.config.ts
```

`src/main.js` also works.

```ts
import {defineConfig} from 'vite';
import frame from '@blueprint/frame';

export default defineConfig({
  plugins: [frame()],
});
```

Render the generated loader in `layout/theme.liquid`.

```liquid
{% render 'frame-assets' %}
```

Ignore generated output.

```gitignore
.frame/
assets/frame-*
snippets/frame-assets.liquid
```

Run Vite and Shopify CLI in separate terminals.

```sh
npm run dev
```

```sh
shopify theme dev --notify .frame/shopify-ready
```

The notification is optional. Vite HMR and Shopify CLI live reload still work without it.

Build before pushing or packaging.

```sh
npm run build
shopify theme push
```

## Named bundles

Load only the code each Liquid surface needs.

```ts
import {defineConfig} from 'vite';
import frame from '@blueprint/frame';

export default defineConfig({
  plugins: [
    frame({
      bundles: {
        theme: {script: 'main.ts', style: 'style.css'},
        product: {script: 'product.ts', style: 'product.css'},
        typography: {style: 'typography.css'},
      },
    }),
  ],
});
```

```liquid
{% render 'frame-assets', entry: 'product' %}
```

Bundle paths resolve from `src` by default. The first bundle is used when `entry` is omitted.

## Configuration

```ts
frame({
  theme: '.',
  source: 'src',
  namespace: 'frame',
  refresh: {
    signal: '.frame/shopify-ready',
    delay: 100,
  },
});
```

`theme` selects the Shopify theme directory. `source` selects the source directory. `namespace` controls generated asset and snippet names. `refresh: false` disables coordinated reloads.

All Vite server and build integrations remain available. Tailwind CSS, Alpine.js, React, Vue, Sass, PostCSS, and other tools use their normal Vite setup. React Fast Refresh requires `@vitejs/plugin-react/preamble` because Frame does not use an HTML entry.

## Safe by default

Frame never empties Shopify's shared `assets` directory. It tracks only its own files, refuses unsafe overwrites, stages builds in isolation, serializes publication, and rolls back interrupted commits.

Production entries keep stable names. Shared chunks, dynamic chunks, imported CSS, images, fonts, and source maps retain Vite's cache safe output behavior.

Shopify CLI remains responsible for authentication, previews, synchronization, pushes, and packaging.

## Examples

• [`examples/vanilla`](examples/vanilla) for TypeScript and CSS

• [`examples/alpine-tailwind`](examples/alpine-tailwind) for Alpine.js and Tailwind CSS

• [`examples/react`](examples/react) for React inside Liquid sections

• [`examples/vue`](examples/vue) for Vue single file components inside Liquid sections

Each example includes Shopify Theme Editor lifecycle handling, passes CI, and has been tested against a real Shopify development store.

## License

MIT
