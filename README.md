# Frame

Frame is a Vite plugin for building frontend assets for Shopify Liquid themes.

It keeps Vite and Shopify CLI independent: Vite builds and serves frontend code, while Shopify CLI continues to handle theme development, synchronization, previews, pushes, and packaging.

> Frame is an early prototype. Its API and generated output formats may change.

## Features

- Works with a Shopify theme at the project root or in a configured directory.
- Supports JavaScript and TypeScript through Vite.
- Supports CSS-only, script-only, and combined bundles.
- Supports multiple explicitly named bundles.
- Uses stable top-level entry filenames and content-hashed shared or dynamic assets.
- Handles shared CSS, dynamic CSS, static assets, source maps, and module preloads.
- Generates development and production Liquid asset loaders.
- Integrates with Vite HMR.
- Coordinates full-page reloads with Shopify CLI’s `--notify` option.
- Safely removes only stale Frame-owned output.
- Uses isolated staging, ownership ledgers, commit locking, and rollback journals.
- Recovers generated Liquid and interrupted production commits.
- Refuses to overwrite files it cannot identify as Frame-owned.
- Detects conflicting Vite build configuration.
- Works with standard Vite integrations such as Alpine.js, Tailwind CSS, React, Vue, Sass, and PostCSS.
- Adds no required production browser runtime.

## Installation

```sh
pnpm add --save-dev @blueprint/frame vite
```

Frame requires Node.js 22.12 or newer and supports Vite 7 and 8.

## Example theme

[`examples/Easel`](examples/Easel) is a small, complete Shopify Liquid theme configured to use Frame.

## Default project structure

Frame assumes the Shopify theme is at the project root:

```text
.
├── assets/
├── config/
├── layout/
├── locales/
├── sections/
├── snippets/
├── templates/
├── src/
│   ├── main.ts
│   └── style.css
└── vite.config.ts
```

`src/main.js` can be used instead of `src/main.ts`.

## Configuration

```ts
import {defineConfig} from 'vite';
import frame from '@blueprint/frame';

export default defineConfig({
  plugins: [frame()],
});
```

With no Frame options, the default `theme` bundle combines:

- `src/main.ts` or `src/main.js`
- `src/style.css`

## Generated Liquid

Frame generates `snippets/frame-assets.liquid`.

Render it from the theme layout:

```liquid
{% render 'frame-assets' %}
```

The development form loads Vite and its HMR client. The production form loads built assets through Shopify’s `asset_url` filter.

The generated snippet should normally be ignored by Git:

```gitignore
snippets/frame-assets.liquid
.frame/
```

## Development

Run Vite and Shopify CLI independently:

```sh
npm run dev
shopify theme dev --notify .frame/shopify-ready
```

Vite handles JavaScript and CSS updates. Shopify CLI handles Liquid and other theme files. Frame requests a full-page reload after Shopify CLI signals that its update is ready.

## Production

Build assets before pushing or packaging the theme:

```sh
npm run build
shopify theme push
```

Or:

```sh
npm run build
shopify theme package
```

Frame does not launch or wrap Shopify CLI.

## Named bundles

```ts
frame({
  bundles: {
    theme: {
      script: 'main.ts',
      style: 'style.css',
    },
    product: {
      script: 'product.ts',
      style: 'product.css',
    },
    account: {
      script: 'account.ts',
    },
    typography: {
      style: 'typography.css',
    },
  },
});
```

Bundle paths resolve relative to the configured source directory.

Render a specific bundle by name:

```liquid
{% render 'frame-assets', entry: 'product' %}
```

The first configured bundle is used when `entry` is omitted.

## Options

```ts
frame({
  theme: '.',
  source: 'src',
  bundles: {
    theme: {
      script: 'main.ts',
      style: 'style.css',
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

| Option    | Purpose                                         | Default               |
| --------- | ----------------------------------------------- | --------------------- |
| `theme`   | Shopify theme directory relative to Vite’s root | `.`                   |
| `source`  | Source directory relative to Vite’s root        | `src`                 |
| `bundles` | Explicit named script and stylesheet entries    | `theme` bundle        |
| `liquid`  | Generated snippet filename                      | `frame-assets.liquid` |
| `prefix`  | Namespace for generated Shopify assets          | `frame-`              |
| `refresh` | Shopify-aware reload signal and delay           | Enabled               |

Use `refresh: false` to disable Shopify-aware full-page reloads.

## Output

Production assets are written to the Shopify theme’s `assets/` directory.

Frame provides:

- Stable names for top-level JavaScript and CSS entries.
- Content hashes for shared chunks, dynamic chunks, and dynamically loaded CSS.
- Production stylesheet tags and module scripts.
- Module preload tags for static JavaScript imports.
- Complete copying of Vite-emitted assets and source maps.
- No empty JavaScript file for CSS-only bundles.

Frame stores internal build state under `.frame/`, including:

- Per-build staging directories.
- Theme-specific ownership ledgers.
- The latest internal Frame manifest.
- The latest production Liquid backup.
- Commit locks and temporary recovery journals.

## Output safety

Frame never empties Shopify’s shared `assets/` directory.

It only replaces or removes files recorded in the theme-specific ownership ledger. Production publication uses isolated staging and transactional recovery so concurrent or interrupted builds cannot silently combine unrelated output.

If an existing destination is not demonstrably Frame-owned or byte-identical to the generated file, the build stops without overwriting it.

## Vite compatibility

Frame uses Vite’s normal module graph and plugin system. Frameworks and preprocessors should use their standard Vite integrations.

Frame manages the Vite settings required for Shopify output, including the build input, output directory, manifest, flat asset layout, and output filenames. It reports an error when another configuration conflicts with those requirements.

Native Vite server options such as `server.origin`, `server.cors`, and `server.allowedHosts` remain available for LAN, tunnel, or custom-domain development.

## License

MIT
