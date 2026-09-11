# create-easel

Create a focused Shopify Liquid theme with Easel, Vite, and your choice of tools. The interactive UI uses [Clack](https://github.com/bombshell-dev/clack).

Easel is a personal project by Billy Noyes, a Shopify employee. It is not an official Shopify product.

**Not published to npm yet.** Run it from a checkout of the Easel repository:

```sh
pnpm install
pnpm create:theme ../my-theme
```

Once a stable version is published, the equivalent commands will be `npm create easel@latest my-theme` or `npx create-easel@latest my-theme`. A prerelease published under `beta` will require `@beta` instead of `@latest`.

## Use the current directory

Pass `.` as the directory, or enter `.` at the directory prompt. The theme is created directly in that folder, and its name is derived from the folder name.

Until npm publication, run the built CLI from your desired folder:

```sh
node /path/to/Easel/packages/create-easel/bin/create-easel.mjs .
```

Build it in the checkout first with `pnpm --dir /path/to/Easel/packages/create-easel build`. Invoke the executable directly so `.` refers to your folder rather than the Easel checkout. Once a stable version is published, `npm create easel@latest .` will do the same.

Existing folders must be empty apart from `.git` and `.DS_Store`, which are preserved. Existing project files, including a README or `.gitignore`, are not overwritten or merged.

## Choices

- TypeScript (default) or JavaScript.
- No UI framework (default), Alpine, React, or Vue.
- Plain CSS (default) or Tailwind CSS.
- Optional dependency installation using npm, pnpm, Yarn, or Bun. The manager is detected from the invoking package manager; use `--package-manager` to override it.

The output is a standalone project using the published `vite-plugin-shopify-easel` package. It does not depend on this repository or on the scaffolder at runtime. The current templates target Easel `0.1.0-beta.1` and require Node.js 22.12.0 or newer.

The starter includes a homepage counter, a 404 page, theme settings, and translations. It is deliberately not a complete commerce theme. Framework integrations use their official Vite plugins where applicable, and include Theme Editor initialization and cleanup. React includes its development preamble.

## Non-interactive use

```sh
pnpm create:theme ../my-theme --yes --language ts --framework vue --tailwind --no-install
```

Flags:

| Flag                                     | Behaviour                                                         |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `--language ts\|js`                      | Select the source language.                                       |
| `--framework none\|alpine\|react\|vue`   | Select UI tools.                                                  |
| `--tailwind` / `--no-tailwind`           | Enable or disable Tailwind.                                       |
| `--name "My Theme"`                      | Set the theme display name; otherwise derived from the directory. |
| `--package-manager npm\|pnpm\|yarn\|bun` | Override package-manager detection.                               |
| `--install` / `--no-install`             | Enable or disable dependency installation.                        |
| `--yes`, `-y`                            | Skip prompts and use defaults for unspecified options.            |
| `--no-interactive`                       | Disable prompts explicitly.                                       |
| `--help`, `-h`                           | Show usage.                                                       |
| `--version`, `-v`                        | Show the CLI version.                                             |

Without an interactive terminal, or in CI, a directory is required, prompts are skipped, and dependencies are installed **only** when `--install` is supplied. `--yes` does not imply installation. Dependency installation can execute package lifecycle scripts; use `--no-install` to inspect the project first.

## Safety and ownership

- New directories and existing empty directories are supported. Git and Finder metadata are preserved; populated directories and symlink targets are rejected. There is no overwrite or force option.
- All questions are answered before writing the theme. Cancelling a prompt exits with code 130 without creating it.
- Templates are rendered in a temporary directory before copying to the target. On failure, rollback removes only unchanged generated files and empty directories it created. Existing directories, metadata, and concurrent edits are preserved. Newly created parent directories can remain.
- Installation failure or Ctrl+C during installation keeps the theme and prints retry instructions. Failures return a nonzero exit code.
- The CLI does not authenticate with Shopify, create stores, push themes, initialize Git, or change global package-manager configuration.
- The CLI invokes the selected package manager directly, without interpolating the destination into a shell command. pnpm installation uses `--ignore-workspace` to avoid installing into an unrelated ancestor workspace.

After generation, normal Vite commands and Shopify CLI take over. Easel does not wrap either tool. Stop development before building and deploy the generated Liquid loader alongside its matching assets.

## Development

From the repository root:

```sh
pnpm --dir packages/create-easel build
pnpm --dir packages/create-easel check
pnpm test
pnpm build
pnpm test:package
```

The CLI is TypeScript bundled with tsup. One base theme is composed with small framework overlays; Tailwind changes the generated config and CSS. JavaScript templates are derived from the TypeScript sources at build time rather than maintained as duplicate themes. The Vue component uses runtime props declarations so both script languages share its implementation.

The repository's `test/create.test.js` covers generation, validation, filesystem safety, automation, and installation outcomes. The package's `test/install.test.js` also checks signal-handler ordering and cleanup. The package smoke test installs the actual tarball, exercises the npm executable, and installs and checks all 16 language/framework/styling combinations outside the repository. `pnpm test:theme-check` also validates the generated Liquid variants.

Publishing this package is separate from publishing the Vite plugin. No scaffolder release workflow or npm trusted publisher is configured yet; see the repository's `RELEASING.md` for the current release boundary.
