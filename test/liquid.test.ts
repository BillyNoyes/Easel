import {describe, expect, it} from 'vitest';
import {renderDevelopmentLiquid, renderProductionLiquid} from '../src/liquid.js';
import type {EaselManifest} from '../src/types.js';

function manifest(overrides: Partial<EaselManifest> = {}): EaselManifest {
  return {
    schemaVersion: 1,
    entries: {
      theme: {
        script: 'easel-theme.js',
        styles: ['easel-theme.css'],
        imports: ['easel-shared-Ab_12.js'],
      },
    },
    generated: [],
    ...overrides,
  };
}

describe('generated Liquid', () => {
  it('uses Shopify filters and valid module resource markup', () => {
    const liquid = renderProductionLiquid(manifest());

    expect(liquid).toContain("{{ 'easel-theme.css' | asset_url | stylesheet_tag }}");
    expect(liquid).toContain(
      '<link rel="modulepreload" href="{{ \'easel-shared-Ab_12.js\' | asset_url }}">',
    );
    expect(liquid).toContain(
      '<script src="{{ \'easel-theme.js\' | asset_url }}" type="module" defer></script>',
    );
    expect(liquid).toContain(
      '<!-- [easel] Unknown bundle "{{ easel_entry | escape }}". -->',
    );
  });

  it.each([
    "easel-person's.js",
    'easel-quoted"asset.js',
    '../easel-theme.js',
    'easel theme.js',
    'easel-theme.css',
  ])('rejects an unsafe entry script filename: %s', (script) => {
    expect(() =>
      renderProductionLiquid(
        manifest({entries: {theme: {script, styles: [], imports: []}}}),
      ),
    ).toThrow('cannot render unsafe entry script filename');
  });

  it('validates stylesheet and module import filenames independently', () => {
    expect(() =>
      renderProductionLiquid(
        manifest({
          entries: {
            theme: {styles: ["easel-person's.css"], imports: []},
          },
        }),
      ),
    ).toThrow('cannot render unsafe stylesheet filename');
    expect(() =>
      renderProductionLiquid(
        manifest({
          entries: {
            theme: {styles: [], imports: ['easel-shared.css']},
          },
        }),
      ),
    ).toThrow('cannot render unsafe module import filename');
  });

  it('rejects unsafe, duplicate, and missing development bundle names', () => {
    expect(() =>
      renderDevelopmentLiquid(['theme', "editor's"], 'http://localhost:5173'),
    ).toThrow('cannot render unsafe Liquid bundle name');
    expect(() =>
      renderDevelopmentLiquid(['theme', 'theme'], 'http://localhost:5173'),
    ).toThrow('cannot render duplicate Liquid bundle name');
    expect(() => renderDevelopmentLiquid([], 'http://localhost:5173')).toThrow(
      'cannot render Liquid without an entry',
    );
  });

  it('normalizes an origin while rejecting URL components that do not belong in one', () => {
    expect(renderDevelopmentLiquid(['theme'], 'https://localhost:5173/')).toContain(
      'src="https://localhost:5173/@vite/client"',
    );

    for (const origin of [
      'https://user@localhost:5173',
      'https://localhost:5173/vite',
      'https://localhost:5173?preview=true',
      'https://localhost:5173#vite',
    ]) {
      expect(() => renderDevelopmentLiquid(['theme'], origin)).toThrow(
        'cannot contain credentials, a path, a query, or a fragment',
      );
    }
    expect(() => renderDevelopmentLiquid(['theme'], 'ws://localhost:5173')).toThrow(
      'must use HTTP or HTTPS',
    );
  });

  it('rejects unsupported manifest schemas and oversized loaders', () => {
    expect(() =>
      renderProductionLiquid({
        ...manifest(),
        schemaVersion: 2,
      } as unknown as EaselManifest),
    ).toThrow('unsupported manifest schema version');
    expect(() =>
      renderDevelopmentLiquid(['a'.repeat(100_000)], 'http://localhost:5173'),
    ).toThrow('generated Liquid is');
  });
});
