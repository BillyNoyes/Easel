import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import {build} from 'vite';
import {describe, expect, it} from 'vitest';
import {frame} from '../src/index.js';

function themeProject(): string {
  const fixtures = join(process.cwd(), '.frame');
  mkdirSync(fixtures, {recursive: true});
  const root = mkdtempSync(join(fixtures, 'ecosystem-'));
  for (const directory of ['assets', 'layout', 'sections', 'snippets', 'src']) {
    mkdirSync(join(root, directory), {recursive: true});
  }
  writeFileSync(
    join(root, 'layout/theme.liquid'),
    "{{ content_for_header }}{% render 'frame-assets' %}{{ content_for_layout }}",
  );
  return root;
}

describe('frontend ecosystem compatibility', () => {
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
        frame({
          bundles: {
            storefront: {
              script: 'storefront.ts',
              style: 'storefront.css',
            },
          },
        }),
      ],
    });

    const javascript = readFileSync(join(root, 'assets/frame-storefront.js'), 'utf8');
    const css = readFileSync(join(root, 'assets/frame-storefront.css'), 'utf8');
    const liquid = readFileSync(join(root, 'snippets/frame-assets.liquid'), 'utf8');

    expect(Buffer.byteLength(javascript)).toBeGreaterThan(10_000);
    expect(css).toMatch(/\.grid\s*\{[^}]*display:\s*grid/);
    expect(css).toMatch(/\.items-center\s*\{[^}]*align-items:\s*center/);
    expect(liquid).toContain("when 'storefront'");
    expect(liquid).toContain("'frame-storefront.css' | asset_url");
  });
});
