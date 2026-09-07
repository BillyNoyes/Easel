# Frame

**Modern frontend tooling for Shopify Liquid themes—without replacing Shopify CLI.**

Frame connects Vite’s fast development experience and production bundling to Shopify’s theme architecture. Write JavaScript, TypeScript, and CSS with the Vite ecosystem you already know; Frame generates the Liquid loader, publishes assets safely, and coordinates reloads with Shopify CLI.

```text
Your source → Vite → Frame → Shopify theme assets + Liquid
```

Shopify CLI remains fully independent and continues to own authentication, theme previews, synchronization, pushes, and packaging.

> Frame is currently an early prototype. Its API and generated formats may change before the first stable release.

## Why Frame?

Using Vite with a Liquid theme usually leaves you to solve several integration problems yourself:

- Mapping Vite’s output graph into Shopify’s flat `assets/` directory.
- Generating the correct development and production Liquid tags.
- Coordinating Vite updates with Shopify CLI uploads.
- Cleaning stale bundles without deleting merchant or theme-owned assets.
- Recovering generated files after interrupted builds or development sessions.

Frame handles those boundaries while staying out of the way of Vite, Shopify CLI, and your preferred frontend stack.

## Highlights

### Vite-native

- JavaScript and TypeScript out of the box.
- CSS-only, script-only, and combined bundles.
- Explicit multi-bundle configuration.
- Shared chunks, dynamic imports, static assets, and source maps.
- Static module preloads and dynamically loaded CSS.
- Standard Vite integrations for Tailwind CSS, Alpine.js, React, Vue, Sass, PostCSS, and more.
- No Frame runtime shipped to the storefront.

### Shopify-native

- Generates `snippets/frame-assets.liquid` automatically.
- Uses Vite assets during development and Shopify `asset_url` in production.
- Works with a theme at the project root or in a nested directory.
- Keeps `shopify theme dev`, `push`, and `package` independently runnable.
- Coordinates full-page reloads through Shopify CLI’s public `--notify` option.
- Continues working with Shopify CLI’s normal live reload when `--notify` is omitted.

### Safe by default

- Never empties Shopify’s shared `assets/` directory.
- Removes only stale files recorded as Frame-owned.
- Refuses to overwrite files it cannot identify safely.
- Uses isolated build staging and theme-specific ownership ledgers.
- Serializes concurrent publication with commit locking.
- Uses durable rollback journals to recover interrupted commits.
- Restores the last production Liquid loader after development.
- Detects Vite configuration that conflicts with safe Shopify output.

## Requirements

- Node.js 22.12 or newer
- Vite 7 or 8
- Shopify CLI for theme development and deployment

## Install

```sh
pnpm add --save-dev @blueprint/frame vite
```

Or with npm:

```sh
npm install --save-dev @blueprint/frame vite
```

Add ordinary Vite scripts to your project:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  }
}
```

Frame does not add replacement `frame dev` or `frame build` commands.

## Quick start

### 1. Keep the Shopify theme at the project root

```text
.
├── assets/
├── blocks/
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

### 2. Add Frame to Vite

```ts
import {defineConfig} from 'vite';
import frame from '@blueprint/frame';

export default defineConfig({
  plugins: [frame()],
});
```

With no options, Frame creates one bundle named `theme` from:

- `src/main.ts` or `src/main.js`
- `src/style.css`

### 3. Render the generated loader

Add this to `layout/theme.liquid`, normally inside `<head>`:

```liquid
{% render 'frame-assets' %}
```

Frame creates `snippets/frame-assets.liquid` when Vite starts or builds.

### 4. Ignore generated state

```gitignore
.frame/
assets/frame-*
snippets/frame-assets.liquid
```

### 5. Start development

Run Vite and Shopify CLI in separate terminals:

```sh
npm run dev
```

```sh
shopify theme dev --notify .frame/shopify-ready
```

Vite handles JavaScript and CSS updates. Shopify CLI synchronizes Liquid, JSON templates, sections, settings, and other theme files. The notification tells Frame when Shopify CLI has finished processing an update, allowing Frame to request one correctly timed full-page reload.

The notification is optional. Without it, Vite HMR and Shopify CLI’s normal live reload continue to work independently. Set `refresh: false` if you do not want Frame to watch the signal file.

## Build and deploy

Always build before pushing or packaging the theme:

```sh
npm run build
shopify theme push
```

To create a Shopify theme archive:

```sh
npm run build
shopify theme package
```

Production builds write the generated assets into the theme’s `assets/` directory and replace the development loader with Shopify CDN asset tags.

## Named bundles

Use named bundles to load code only where it is needed:

```ts
import {defineConfig} from 'vite';
import frame from '@blueprint/frame';

export default defineConfig({
  plugins: [
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
    }),
  ],
});
```

Bundle paths resolve relative to `source`, which defaults to `src`.

Render a specific bundle from Liquid:

```liquid
{% render 'frame-assets', entry: 'product' %}
```

When `entry` is omitted, Frame renders the first configured bundle.

## Configuration

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
  namespace: 'frame',
  refresh: {
    signal: '.frame/shopify-ready',
    delay: 100,
  },
});
```

| Option      | Description                                       | Default        |
| ----------- | ------------------------------------------------- | -------------- |
| `theme`     | Shopify theme directory relative to Vite’s root   | `.`            |
| `source`    | Source directory relative to Vite’s root          | `src`          |
| `bundles`   | Named script and stylesheet entry definitions     | `theme` bundle |
| `namespace` | Name used for generated assets and Liquid         | `frame`        |
| `refresh`   | Shopify-aware reload signal and debounce settings | Enabled        |

A custom namespace such as `namespace: 'studio'` produces `assets/studio-*` and `snippets/studio-assets.liquid`.

### Nested theme directory

```ts
frame({
  theme: 'theme',
  source: 'frontend',
});
```

Both paths resolve relative to Vite’s root. Bundle paths continue to resolve relative to `source`.

### Disable coordinated reloads

```ts
frame({
  refresh: false,
});
```

### Configure an external development origin

Frame leaves Vite’s server options available:

```ts
export default defineConfig({
  server: {
    origin: 'https://theme-dev.example.com',
    allowedHosts: ['theme-dev.example.com'],
  },
  plugins: [frame()],
});
```

Use Vite’s `server.cors` option when a custom storefront domain also needs access to the development server.

## Production output

Frame produces:

- Stable filenames for top-level JavaScript and CSS entries.
- Content-hashed shared and dynamic JavaScript chunks.
- Content-hashed dynamically imported CSS.
- Shopify stylesheet and module-script tags.
- Module preload tags for static imports.
- Imported images, fonts, and other Vite assets.
- Source maps when enabled through Vite.
- No empty JavaScript output for CSS-only bundles.

Frame stores internal state in `.frame/`:

- Isolated per-build staging directories.
- Theme-specific ownership ledgers.
- The latest internal Frame manifest.
- The latest production Liquid backup.
- Temporary commit locks and recovery journals.

## Generated-output safety

Shopify themes mix compiled assets and hand-authored files in the same `assets/` directory. A broad cleanup step can easily delete something it does not own.

Frame records every file it publishes and removes only stale entries from that ownership ledger. If a destination already exists without trustworthy ownership evidence or byte-identical generated content, Frame stops rather than overwriting it.

If a process or machine stops during publication, the durable transaction journal allows the next build to restore the previous state before continuing.

## Frontend integrations

Frame does not wrap or replace the Vite plugin ecosystem.

### Tailwind CSS

```ts
import tailwindcss from '@tailwindcss/vite';
import {defineConfig} from 'vite';
import frame from '@blueprint/frame';

export default defineConfig({
  plugins: [tailwindcss(), frame()],
});
```

### Alpine.js

```ts
import Alpine from 'alpinejs';

Alpine.start();
```

React, Vue, Sass, PostCSS, and other tools use their normal Vite configuration in the same way. With `@vitejs/plugin-react` 6, import `@vitejs/plugin-react/preamble` at the top of the React entry so Fast Refresh works without an HTML entry point; the React example shows the complete setup.

## Example themes

Each example is a small, independently runnable Shopify Liquid theme:

- [`examples/vanilla`](examples/vanilla) — TypeScript and plain CSS.
- [`examples/alpine-tailwind`](examples/alpine-tailwind) — Alpine.js and Tailwind CSS through the official Vite plugin.
- [`examples/react`](examples/react) — React components mounted inside Liquid sections.
- [`examples/vue`](examples/vue) — Vue single-file components mounted inside Liquid sections.

The framework examples handle Shopify Theme Editor section load and unload events. Every example is type-checked, built through Frame, and validated with Shopify Theme Check in CI.

All four examples have also been exercised against a real Shopify development store: local previews, Vite development assets, `--notify` reloads, operation without `--notify`, production builds, strict unpublished pushes, remote asset pulls, and cleanup. The React Fast Refresh preamble and the React/Vue client mounts were verified in a browser.

### Scaffold another integration example

Repository contributors can create a framework-neutral theme foundation with:

```sh
pnpm scaffold:theme examples/svelte --name "Frame Svelte"
```

The command creates the Shopify directories, minimal layouts, sections, templates, locales, settings, TypeScript and CSS entries, and Frame/Vite configuration. It refuses to overwrite an existing path. From there, add only the dependencies, Vite plugin, source components, and Theme Editor lifecycle behavior required by the framework being demonstrated.

## Tested behavior

Frame’s automated suite covers Vite 7 and 8 across Node 22 and 24, with Linux, macOS, and Windows CI. It includes production builds, development shutdown, CSS-only entries, dynamic imports, shared CSS, static assets, source maps, concurrent builds, failed plugin hooks, stale cleanup, ownership validation, symlink protection, and interrupted-commit recovery.

## Philosophy

Frame is deliberately focused:

- **Vite builds frontend assets.**
- **Frame adapts them safely to Shopify Liquid.**
- **Shopify CLI handles the store.**

No custom bundler. No managed Shopify process. No mandatory framework. No storefront runtime.

## License

MIT
