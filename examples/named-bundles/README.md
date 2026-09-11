# Easel named bundles

A focused TypeScript and CSS theme with separate product and collection entries. No framework or CSS library is required.

## What loads

| Page                 | Script and style bundles |
| -------------------- | ------------------------ |
| Home and other pages | `theme`                  |
| Product              | `theme` + `product`      |
| Collection           | `theme` + `collection`   |

The product page has a quantity stepper. The collection page filters product titles on the current paginated page. These are small bundle demonstrations, not a complete commerce theme: there is no cart or checkout implementation.

## Entry paths

```text
src/
  main.ts
  style.css
  sections.ts
  pages/
    product.ts
    product.css
    collection.ts
    collection.css
```

`vite.config.ts` defines three named bundles. Paths are relative to the default `src` source directory:

```ts
easel({
  bundles: {
    theme: {script: 'main.ts', style: 'style.css'},
    product: {script: 'pages/product.ts', style: 'pages/product.css'},
    collection: {script: 'pages/collection.ts', style: 'pages/collection.css'},
  },
});
```

`layout/theme.liquid` always renders the shared bundle, then selects the page bundle:

```liquid
{% render 'easel-assets', entry: 'theme' %}
{% case request.page_type %}
  {% when 'product' %}
    {% render 'easel-assets', entry: 'product' %}
  {% when 'collection' %}
    {% render 'easel-assets', entry: 'collection' %}
{% endcase %}
```

All bundles are built. Only the rendered bundles and their dependencies are downloaded. `main.ts` does not import either page entry. Vite can extract `sections.ts` into a shared chunk used by both page entries.

The product and collection sections belong on their matching templates. Adding a page-specific section elsewhere also requires loading its bundle there.

## Run

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --dir examples/named-bundles dev
```

In another terminal:

```sh
cd examples/named-bundles
shopify theme dev --store your-store.myshopify.com --notify .easel/shopify-ready
```

Use a development store with products published to the Online Store. Follow the home page's product links or browse a collection. No store content is created by this example.

For a production build, stop Vite first:

```sh
pnpm --dir examples/named-bundles check
```

In browser DevTools, disable the cache, clear the Network log between pages, and compare a home, product, and collection page. Development uses `/@easel/theme`, `/@easel/product`, and `/@easel/collection`. Production uses `easel-theme.*`, `easel-product.*`, and `easel-collection.*`. The other page's entry and stylesheet should not load.

## Section lifecycle

`src/sections.ts` mounts each section once, handles `shopify:section:load` and `shopify:section:unload`, and removes listeners during HMR disposal. Each page module supplies its own initialization and cleanup.

Without JavaScript, the quantity input still works and collection products remain visible. Script-only controls are hidden until initialized.

Named bundles are an optional optimization for page-specific features. A single entry with dynamic imports remains a simpler option for many themes.
