# Contributing

Issues and focused pull requests are welcome.

## Before opening an issue

- Check the documentation and troubleshooting guidance.
- Confirm the behavior with a current stable release.
- Remove store domains, credentials, customer data, and other sensitive information from reproductions.
- Use GitHub private vulnerability reporting instead of a public issue for security concerns.

## Development

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test:theme-check
```

Use Node.js 22.12 or newer. Shopify CLI is installed and authenticated separately.

Keep changes focused and include tests for behavior changes. Generator changes must continue to work across TypeScript and JavaScript, all supported framework choices, and plain CSS and Tailwind CSS. Public examples must use the published `vite-plugin-shopify-easel` package rather than repository-relative imports.

By contributing, you agree that your contribution is licensed under the repository's MIT license.
