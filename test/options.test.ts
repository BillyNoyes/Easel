import {mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {resolveEaselOptions} from '../src/options.js';

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'easel-options-'));
  for (const directory of ['assets', 'layout', 'snippets', 'src']) {
    mkdirSync(join(root, directory), {recursive: true});
  }
  for (const [file, content] of Object.entries(files)) {
    const path = join(root, file);
    mkdirSync(join(path, '..'), {recursive: true});
    writeFileSync(path, content);
  }
  return root;
}

describe('resolveEaselOptions', () => {
  it('uses a root-level Shopify theme and the TypeScript defaults', () => {
    const root = project({
      'src/main.ts': 'export const theme = true;',
      'src/style.css': ':root { color: black; }',
    });

    const options = resolveEaselOptions({}, root);

    expect(options.themePath).toBe(realpathSync(root));
    expect(options.sourcePath).toBe(realpathSync(join(root, 'src')));
    expect(options.namespace).toBe('easel');
    expect(options.prefix).toBe('easel-');
    expect(options.liquidFilename).toBe('easel-assets.liquid');
    expect(options.bundles).toEqual([
      {
        name: 'theme',
        script: realpathSync(join(root, 'src/main.ts')),
        style: realpathSync(join(root, 'src/style.css')),
      },
    ]);
  });

  it('falls back to main.js without additional configuration', () => {
    const root = project({
      'src/main.js': 'export const theme = true;',
      'src/style.css': ':root { color: black; }',
    });

    const options = resolveEaselOptions({}, root);

    expect(options.bundles[0]?.script).toBe(realpathSync(join(root, 'src/main.js')));
  });

  it('supports custom source locations and named bundles', () => {
    const root = project({
      'frontend/store.ts': 'export const store = true;',
      'frontend/product.ts': 'export const product = true;',
      'frontend/product.css': '.product {}',
    });

    const options = resolveEaselOptions(
      {
        source: 'frontend',
        bundles: {
          storefront: {script: 'store.ts'},
          product: {script: 'product.ts', style: 'product.css'},
        },
      },
      root,
    );

    expect(options.bundles.map((bundle) => bundle.name)).toEqual([
      'storefront',
      'product',
    ]);
  });

  it('derives asset and Liquid names from a custom namespace', () => {
    const root = project({
      'src/main.ts': 'export const theme = true;',
      'src/style.css': ':root {}',
    });

    const options = resolveEaselOptions({namespace: 'studio-kit'}, root);

    expect(options.namespace).toBe('studio-kit');
    expect(options.prefix).toBe('studio-kit-');
    expect(options.liquidFilename).toBe('studio-kit-assets.liquid');
  });

  it('rejects an unsafe namespace', () => {
    const root = project({
      'src/main.ts': 'export const theme = true;',
      'src/style.css': ':root {}',
    });

    expect(() => resolveEaselOptions({namespace: '../studio'}, root)).toThrow(
      'namespace must use lowercase letters',
    );
  });

  it('rejects named bundles that share a script entry', () => {
    const root = project({'src/shared.ts': 'export const shared = true;'});

    expect(() =>
      resolveEaselOptions(
        {
          bundles: {
            first: {script: 'shared.ts'},
            second: {script: 'shared.ts'},
          },
        },
        root,
      ),
    ).toThrow('each named bundle needs a distinct script entry');
  });

  it('rejects an ambiguous default script', () => {
    const root = project({
      'src/main.js': 'export const javascript = true;',
      'src/main.ts': 'export const typescript = true;',
      'src/style.css': ':root {}',
    });

    expect(() => resolveEaselOptions({}, root)).toThrow('both main.ts and main.js exist');
  });

  it('rejects a symlinked Easel staging directory', () => {
    const root = project({
      'src/main.ts': 'export const theme = true;',
      'src/style.css': ':root {}',
    });
    const external = mkdtempSync(join(tmpdir(), 'easel-external-state-'));
    mkdirSync(join(root, '.easel'), {recursive: true});
    symlinkSync(
      external,
      join(root, '.easel/build'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    expect(() => resolveEaselOptions({}, root)).toThrow(
      'state directory must be a real directory',
    );
  });

  it.skipIf(process.platform === 'win32')(
    'rejects a dangling symlink in Easel state',
    () => {
      const root = project({
        'src/main.ts': 'export const theme = true;',
        'src/style.css': ':root {}',
      });
      mkdirSync(join(root, '.easel'), {recursive: true});
      symlinkSync(join(root, 'missing-state'), join(root, '.easel/build'), 'dir');

      expect(() => resolveEaselOptions({}, root)).toThrow(
        'state directory must be a real directory',
      );
    },
  );

  it('allows a script-only bundle when configured explicitly', () => {
    const root = project({'src/main.ts': 'export const theme = true;'});

    const options = resolveEaselOptions({bundles: {theme: {script: 'main.ts'}}}, root);

    expect(options.bundles[0]).toEqual({
      name: 'theme',
      script: realpathSync(join(root, 'src/main.ts')),
    });
  });
});
