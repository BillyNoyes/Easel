# Easel

Easel is an independent Vite plugin and theme generator for Shopify Liquid themes.

It builds JavaScript, TypeScript, and CSS into Shopify theme assets, generates the Liquid that loads them, and safely replaces only output it owns. Shopify CLI remains responsible for authentication, previews, synchronization, and deployment.

[Create a theme](#create-a-new-theme) · [Add Easel to a theme](#add-easel-to-an-existing-theme) · [Choosing Easel](https://easel.billynoyes.co.uk/docs/#choosing-easel) · [Documentation](https://easel.billynoyes.co.uk/docs/) · [Examples](#examples)

## Create a new theme

```sh
npm create easel-theme@latest my-theme
```

[`create-easel-theme`](packages/create-easel) scaffolds TypeScript or JavaScript, optional Alpine, React or Vue, and plain CSS or Tailwind CSS. It includes generic Online Store 2.0 JSON templates for the standard storefront page types while leaving current customer accounts to Shopify.

Use `.` instead of `my-theme` to scaffold into an empty current directory. Use `--yes --no-install` for non-interactive automation. Existing files are never overwritten. Generated projects include `npm run check:theme` for Shopify Theme Check and `npm run check:all` for source, build, and Liquid validation.

## Why Easel

- **Vite-native:** use normal Vite plugins, configuration, dynamic imports, HMR, and production builds.
- **Shopify-native:** keep the standard Liquid theme structure and use Shopify CLI directly for store operations.
- **Safe publication:** stage output, track ownership, reject unsafe overwrites, and roll back interrupted commits.
- **Selective loading:** start with one shared entry and add named script, style, or CSS-only bundles when needed.
- **Framework optional:** use vanilla TypeScript, Alpine, React, Vue, Tailwind CSS, Sass, or PostCSS through their standard Vite integrations.

## Add Easel to an existing theme

```sh
pnpm add -D vite-plugin-shopify-easel vite
```

Easel requires Node.js 22.12 or newer and supports Vite 7 and 8.

From a checkout of this repository, run `pnpm install` and `pnpm create:theme ../my-theme` to exercise the local generator. Shopify CLI is installed and authenticated separately.

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

## Support and security

Use the [documentation](https://easel.billynoyes.co.uk/docs/) for setup and troubleshooting, [open an issue](https://github.com/BillyNoyes/Easel/issues) for reproducible bugs and focused feature requests, and use [private vulnerability reporting](https://github.com/BillyNoyes/Easel/security/advisories/new) for security concerns. See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

MIT
