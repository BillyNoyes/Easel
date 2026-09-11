# Easel repository guidance

Easel is an independent Vite plugin and theme generator for Shopify Liquid themes. It is not a Hydrogen framework, custom-storefront framework, Shopify app framework, or replacement for Shopify CLI.

## Public packages

- `vite-plugin-shopify-easel` adapts Vite development and production output to a Shopify theme.
- `create-easel-theme` scaffolds a new theme that depends on the published plugin.

Public examples must import `vite-plugin-shopify-easel`, never repository source paths. Generated projects must not depend on this repository or the generator at runtime.

## Product boundaries

- Shopify CLI owns authentication, stores, previews, synchronization, deployment, and packaging.
- Easel uses ordinary Vite commands and integrations.
- Theme directories live at the project root; source defaults to `src`.
- Generated `snippets/easel-assets.liquid` must be deployed with its matching assets.
- Stop the development server before a production build or deployment.
- Never delete unrelated theme assets or Easel ownership state to force a build.

## Validation

Run `pnpm check` for formatting, linting, types, tests, examples, site checks, builds, and packed-package smoke tests. Run `pnpm test:theme-check` for Shopify Theme Check coverage.

Changes to the generator must preserve all language, framework, and styling combinations. Changes to publication logic must keep plugin and generator versions aligned and must not introduce npm tokens.
