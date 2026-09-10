import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import {build} from 'vite';
import {afterEach, describe, expect, it} from 'vitest';
import {easel} from '../src/index.js';

const projects: string[] = [];

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
