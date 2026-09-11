import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {join} from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import {build} from 'vite';
import {afterEach, describe, expect, it} from 'vitest';
import {easel} from '../src/index.js';

const projects: string[] = [];

function packageMetadata(path: string): {
  version: unknown;
  devDependencies: Record<string, unknown> | undefined;
} {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Invalid package metadata: ${path}`);
  }
  const metadata = value as Record<string, unknown>;
  const devDependencies = metadata.devDependencies;
  if (
    devDependencies !== undefined &&
    (typeof devDependencies !== 'object' || devDependencies === null)
  ) {
    throw new Error(`Invalid devDependencies: ${path}`);
  }
  return {
    version: metadata.version,
    devDependencies: devDependencies as Record<string, unknown> | undefined,
  };
}

afterEach(() => {
  for (const project of projects.splice(0)) {
    rmSync(project, {recursive: true, force: true});
  }
});

function themeProject(): string {
  const fixtures = join(process.cwd(), '.easel');
  mkdirSync(fixtures, {recursive: true});
  const root = mkdtempSync(join(fixtures, 'ecosystem-'));
  projects.push(root);
  for (const directory of ['assets', 'layout', 'sections', 'snippets', 'src']) {
    mkdirSync(join(root, directory), {recursive: true});
  }
  writeFileSync(
    join(root, 'layout/theme.liquid'),
    "{{ content_for_header }}{% render 'easel-assets' %}{{ content_for_layout }}",
  );
  return root;
}

describe('frontend ecosystem compatibility', () => {
  it('uses the published Easel package in public examples', () => {
    for (const name of ['alpine-tailwind', 'named-bundles', 'react', 'vanilla', 'vue']) {
      const directory = join(process.cwd(), 'examples', name);
      const config = readFileSync(join(directory, 'vite.config.ts'), 'utf8');
      const manifest = packageMetadata(join(directory, 'package.json'));
      expect(config).toContain("from 'vite-plugin-shopify-easel'");
      expect(config).not.toContain("from '../../src/index.js'");
      expect(manifest.devDependencies?.['vite-plugin-shopify-easel']).toBe('0.2.0');
      const installedPackage = realpathSync(
        join(directory, 'node_modules/vite-plugin-shopify-easel'),
      );
      expect(installedPackage).not.toBe(process.cwd());
      expect(packageMetadata(join(installedPackage, 'package.json')).version).toBe(
        '0.2.0',
      );
    }
  });

  it('cleans up Shopify section listeners during Vite HMR', () => {
    const entries = [
      'examples/alpine-tailwind/src/main.ts',
      'examples/react/src/main.tsx',
      'examples/vanilla/src/main.ts',
      'examples/vanilla/src/announcement.ts',
      'examples/vue/src/main.ts',
    ];

    for (const entry of entries) {
      const source = readFileSync(join(process.cwd(), entry), 'utf8');
      expect(source, entry).toContain("addEventListener('shopify:section:load'");
      expect(source, entry).toContain("removeEventListener('shopify:section:load'");
      expect(source, entry).toContain('import.meta.hot.dispose');
    }
  });

  it('builds custom TypeScript, Alpine.js, and Tailwind CSS v4 entries', async () => {
    const root = themeProject();
    writeFileSync(
      join(root, 'src/storefront.ts'),
      "import Alpine from 'alpinejs'; window.Alpine = Alpine; Alpine.start();",
    );
    writeFileSync(
      join(root, 'src/storefront.css'),
      '@import "tailwindcss";\n@source "../sections";\n',
    );
    writeFileSync(
      join(root, 'sections/example.liquid'),
      '<div class="grid items-center"></div>',
    );

    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [
        tailwindcss(),
        easel({
          bundles: {
            storefront: {
              script: 'storefront.ts',
              style: 'storefront.css',
            },
          },
        }),
      ],
    });

    const javascript = readFileSync(join(root, 'assets/easel-storefront.js'), 'utf8');
    const css = readFileSync(join(root, 'assets/easel-storefront.css'), 'utf8');
    const liquid = readFileSync(join(root, 'snippets/easel-assets.liquid'), 'utf8');

    expect(Buffer.byteLength(javascript)).toBeGreaterThan(10_000);
    expect(css).toMatch(/\.grid\s*\{[^}]*display:\s*grid/);
    expect(css).toMatch(/\.items-center\s*\{[^}]*align-items:\s*center/);
    expect(liquid).toContain("when 'storefront'");
    expect(liquid).toContain("'easel-storefront.css' | asset_url");
  });
});
