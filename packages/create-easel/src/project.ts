import type {ThemeOptions} from './options.js';
import {packageNameFor} from './options.js';

export function projectPackage(options: ThemeOptions) {
  const typescript = options.language === 'ts';
  const dependencies: Record<string, string> = {};
  const devDependencies: Record<string, string> = {
    vite: '8.2.2',
    'vite-plugin-shopify-easel': '0.2.0',
  };
  if (typescript) devDependencies.typescript = '5.9.3';
  if (options.framework === 'alpine') {
    dependencies.alpinejs = '3.17.1';
    if (typescript) devDependencies['@types/alpinejs'] = '3.13.11';
  }
  if (options.framework === 'react') {
    dependencies.react = '19.2.8';
    dependencies['react-dom'] = '19.2.8';
    devDependencies['@vitejs/plugin-react'] = '6.1.1';
    if (typescript) {
      devDependencies['@types/react'] = '19.2.18';
      devDependencies['@types/react-dom'] = '19.2.7';
    }
  }
  if (options.framework === 'vue') {
    dependencies.vue = '3.5.42';
    devDependencies['@vitejs/plugin-vue'] = '6.0.8';
    if (typescript) devDependencies['vue-tsc'] = '3.3.11';
  }
  if (options.tailwind) {
    devDependencies.tailwindcss = '4.3.3';
    devDependencies['@tailwindcss/vite'] = '4.3.3';
  }
  const typecheck = options.framework === 'vue' ? 'vue-tsc' : 'tsc';
  return {
    name: packageNameFor(options.target),
    private: true,
    type: 'module',
    engines: {node: '>=22.12.0'},
    scripts: {
      dev: 'vite',
      build: 'vite build',
      check: typescript ? `${typecheck} --noEmit && vite build` : 'vite build',
    },
    ...(Object.keys(dependencies).length ? {dependencies} : {}),
    devDependencies,
  };
}

export function viteConfiguration(options: ThemeOptions): string {
  const imports = [
    "import {defineConfig} from 'vite';",
    "import easel from 'vite-plugin-shopify-easel';",
  ];
  const plugins: string[] = [];
  if (options.framework === 'react' || options.framework === 'vue') {
    imports.push(
      `import ${options.framework} from '@vitejs/plugin-${options.framework}';`,
    );
    plugins.push(`${options.framework}()`);
  }
  if (options.tailwind) {
    imports.push("import tailwindcss from '@tailwindcss/vite';");
    plugins.push('tailwindcss()');
  }
  const easel =
    options.framework === 'react'
      ? `easel({bundles: {theme: {script: 'main.${options.language}x', style: 'style.css'}}})`
      : 'easel()';
  plugins.push(easel);
  return `${imports.join('\n')}\n\nexport default defineConfig({\n  plugins: [${plugins.join(', ')}],\n});\n`;
}

export function typescriptConfiguration(options: ThemeOptions) {
  return {
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      moduleResolution: 'Bundler',
      moduleDetection: 'force',
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: ['vite/client'],
      ...(options.framework === 'react' ? {jsx: 'react-jsx'} : {}),
    },
    include: ['src', 'vite.config.ts'],
  };
}

export function projectReadme(options: ThemeOptions): string {
  return `# ${options.name}

A focused Shopify Liquid starter using Easel, Vite, ${options.language === 'ts' ? 'TypeScript' : 'JavaScript'}, ${options.framework === 'none' ? 'no UI framework' : options.framework}, and ${options.tailwind ? 'Tailwind CSS' : 'plain CSS'}.

## Develop

Install dependencies with your chosen package manager, then run \`npm run dev\` (or the equivalent \`pnpm\`, \`yarn\`, or \`bun\` script).

In a second terminal, run:

\`shopify theme dev --store your-store.myshopify.com --notify .easel/shopify-ready\`

Shopify CLI is installed and authenticated separately. The notification flag is optional; Vite HMR and Shopify CLI live reload also work independently. Use \`pnpm install --ignore-workspace\` if this theme is nested inside an unrelated pnpm workspace.

## Build and deploy

Stop the Vite development server, run \`npm run check\`, then use Shopify CLI to preview or deploy the theme. \`npm run build\` builds without the additional TypeScript check.

Deploy \`snippets/easel-assets.liquid\` together with its matching built assets. These generated files are ignored by Git. Never delete unrelated assets or Easel's ownership state to force a build.

## Structure

Shopify directories live at the project root. Source lives in \`src/\`; Easel is configured in \`vite.config.${options.language}\`. The homepage contains a small counter to demonstrate the selected tools, with initialization and cleanup for Theme Editor section reloads.

The starter includes generic JSON templates and sections for products, collections, the collection list, cart, pages, contact, blogs, articles, search, password access, and 404 responses. It also includes theme and password layouts and a Liquid gift card template. These are accessible starting points, not complete commerce features or a production design. Customer account templates are intentionally omitted because current customer accounts operate independently of themes. Shopify's default robots and agent-discovery templates are left unchanged, and metaobject templates should be added for the definitions that enable web pages. Update theme metadata in \`config/settings_schema.json\` for your project.

Start with one shared entry. Add named page bundles only when selective loading is useful; see [the named bundles example](https://github.com/BillyNoyes/Easel/tree/main/examples/named-bundles).

[Easel documentation](https://easel.billynoyes.co.uk/docs/)
`;
}
