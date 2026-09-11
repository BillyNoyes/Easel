# Easel

Easel is a Vite plugin for Shopify Liquid themes.

It builds JavaScript, TypeScript, and CSS into Shopify theme assets, generates the Liquid snippet that loads them, and safely replaces old build output. During development, it can coordinate Vite updates with Shopify CLI reloads. Shopify CLI still handles previews, syncing, and deployment.

[Read the documentation](https://easel.billynoyes.co.uk/docs/)

## Install

```sh
pnpm add -D vite-plugin-shopify-easel vite
```

Easel requires Node.js 22.12 or newer and supports Vite 7 and 8.

## Create a theme

The [Clack-based scaffolder](packages/create-shopify-easel) creates a theme with TypeScript or JavaScript, optional Alpine, React or Vue, and plain CSS or Tailwind.

It is not published to npm yet. From a checkout of this repository:

```sh
pnpm install
pnpm create:theme ../my-theme
```

Use `--yes --no-install` for a non-interactive starter. The CLI also accepts `.` to use the current folder; see [current-directory setup](packages/create-shopify-easel#use-the-current-directory) for running it from outside this checkout. Existing folders must be empty apart from Git or Finder metadata. Shopify CLI remains separate.

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
import easel from 'vite-plugin-shopify-easel';

export default defineConfig({
  plugins: [easel()],
});
```

Render the generated loader in `layout/theme.liquid`.

```liquid
{% render 'easel-assets' %}
```

Ignore generated output.

```gitignore
.easel/
assets/easel-*
snippets/easel-assets.liquid
```

Run Vite and Shopify CLI in separate terminals.

```sh
npm run dev
```

```sh
shopify theme dev --notify .easel/shopify-ready
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
import easel from 'vite-plugin-shopify-easel';

export default defineConfig({
  plugins: [
    easel({
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
{% render 'easel-assets', entry: 'product' %}
```

Bundle paths resolve from `src` by default. The first bundle is used when `entry` is omitted.

## Configuration

```ts
easel({
  // Shopify theme directory relative to the Vite root. Defaults to the Vite root.
  theme: '.',

  // Source directory relative to the Vite root. Defaults to src.
  source: 'src',

  // Named entries relative to source. Defaults to main.ts or main.js with style.css.
  bundles: {
    theme: {script: 'main.ts', style: 'style.css'},
  },

  // Namespace used by generated assets and the Liquid snippet. Defaults to easel.
  namespace: 'easel',

  // Shopify CLI reload coordination. Use false to disable it.
  refresh: {
    // Notification file relative to the Vite root.
    signal: '.easel/shopify-ready',

    // Reload debounce in milliseconds. Defaults to 100.
    delay: 100,
  },
});
```

Use Tailwind CSS, Alpine.js, React, Vue, Sass, PostCSS, and other tools through their normal Vite setup. React Fast Refresh requires `@vitejs/plugin-react/preamble` because Easel does not use an HTML entry.

## Safe by default

Easel never empties Shopify's shared `assets` directory. It tracks only its own files, refuses unsafe overwrites, stages builds in isolation, serializes publication, and rolls back interrupted commits.

Production entries keep stable names. Shared chunks, dynamic chunks, imported CSS, images, fonts, and source maps retain Vite's cache safe output behavior.

Shopify CLI remains responsible for authentication, previews, synchronization, pushes, and packaging.

## Examples

• [`examples/vanilla`](examples/vanilla) for TypeScript and CSS

• [`examples/named-bundles`](examples/named-bundles) for separate product and collection entries

• [`examples/alpine-tailwind`](examples/alpine-tailwind) for Alpine.js and Tailwind CSS

• [`examples/react`](examples/react) for React inside Liquid sections

• [`examples/vue`](examples/vue) for Vue single file components inside Liquid sections

Each example includes Shopify Theme Editor lifecycle handling and automated build checks.

## License

MIT
