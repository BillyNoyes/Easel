import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const plugin = JSON.parse(readFileSync('package.json', 'utf8'));
const generator = JSON.parse(readFileSync('packages/create-easel/package.json', 'utf8'));

const commonKeywords = [
  'shopify',
  'shopify-theme',
  'shopify-liquid',
  'liquid',
  'theme-development',
  'storefront',
  'vite',
];

describe.each([
  ['plugin', plugin],
  ['generator', generator],
])('%s package metadata', (_kind, metadata) => {
  it('has complete public ownership and support metadata', () => {
    expect(metadata.private).not.toBe(true);
    expect(metadata.license).toBe('MIT');
    expect(metadata.author).toEqual({
      name: 'Billy Noyes',
      url: 'https://billynoyes.co.uk/',
    });
    expect(metadata.repository.url).toBe('git+https://github.com/BillyNoyes/Easel.git');
    expect(metadata.homepage).toBe('https://easel.billynoyes.co.uk/');
    expect(metadata.bugs).toBe('https://github.com/BillyNoyes/Easel/issues');
  });

  it('uses descriptive search terms without unsupported claims', () => {
    expect(metadata.description).toMatch(/Shopify Liquid theme/);
    expect(metadata.description).toContain('Vite');
    expect(metadata.keywords).toEqual(expect.arrayContaining(commonKeywords));
    expect(new Set(metadata.keywords).size).toBe(metadata.keywords.length);
    for (const unsupported of ['ai', 'best', 'official']) {
      expect(metadata.keywords).not.toContain(unsupported);
    }
  });
});

describe('package-specific metadata', () => {
  it('identifies the Vite plugin surface', () => {
    expect(plugin.name).toBe('vite-plugin-shopify-easel');
    expect(plugin.keywords).toEqual(
      expect.arrayContaining(['vite-plugin', 'hmr', 'theme-assets']),
    );
    expect(plugin.exports['./package.json']).toBe('./package.json');
  });

  it('identifies the theme generator and executable', () => {
    expect(generator.name).toBe('create-easel-theme');
    expect(generator.keywords).toEqual(
      expect.arrayContaining([
        'create',
        'scaffold',
        'generator',
        'alpinejs',
        'react',
        'vue',
        'tailwindcss',
      ]),
    );
    expect(generator.bin).toEqual({
      'create-easel-theme': 'bin/create-easel-theme.mjs',
    });
    expect(generator.repository.directory).toBe('packages/create-easel');
  });
});
