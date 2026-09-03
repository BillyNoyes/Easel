import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build, createServer} from 'vite';
import {describe, expect, it} from 'vitest';
import {frame} from '../src/index.js';
import {renderDevelopmentLiquid} from '../src/liquid.js';
import {resolveFrameOptions} from '../src/options.js';
import {writeDevelopmentLiquid} from '../src/output.js';
import type {FrameOptions} from '../src/types.js';

function themeProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'frame-build-'));
  for (const directory of [
    'assets',
    'blocks',
    'config',
    'layout',
    'locales',
    'sections',
    'snippets',
    'src',
    'templates',
  ]) {
    mkdirSync(join(root, directory), {recursive: true});
  }
  writeFileSync(
    join(root, 'layout/theme.liquid'),
    '<!doctype html>\n<html><head>{{ content_for_header }}\n{% render \'frame-assets\' %}\n</head><body>{{ content_for_layout }}</body></html>\n',
  );
  return root;
}

async function buildTheme(
  root: string,
  options: FrameOptions = {},
): Promise<void> {
  await build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [frame(options)],
  });
}

function ownershipLedger(root: string): {themePath: string; generated: string[]} {
  const themesPath = join(root, '.frame/themes');
  const themeDirectory = readdirSync(themesPath)[0];
  if (themeDirectory === undefined) throw new Error('Missing Frame theme ledger');
  return JSON.parse(
    readFileSync(join(themesPath, themeDirectory, 'outputs.json'), 'utf8'),
  ) as {themePath: string; generated: string[]};
}

describe('Frame development server', () => {
  it('serves the default TypeScript and CSS bundle without changing the theme layout', async () => {
    const root = themeProject();
    writeFileSync(join(root, 'src/main.ts'), "console.log('Frame dev');");
    writeFileSync(join(root, 'src/style.css'), 'body { color: rebeccapurple; }');
    const layoutBefore = readFileSync(join(root, 'layout/theme.liquid'), 'utf8');

    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: {port: 0},
      plugins: [frame()],
    });

    try {
      await server.listen();
      const origin = server.resolvedUrls?.local[0];
      expect(origin).toBeDefined();
      const response = await fetch(`${origin}@frame/theme`);
      expect(response.ok).toBe(true);
      expect(await response.text()).toContain('src/main.ts');

      const liquid = readFileSync(join(root, 'snippets/frame-assets.liquid'), 'utf8');
      expect(liquid).toContain('/@vite/client');
      expect(liquid).toContain('/@frame/theme');
      expect(readFileSync(join(root, 'layout/theme.liquid'), 'utf8')).toBe(layoutBefore);
    } finally {
      await server.close();
    }

    await buildTheme(root);
    const productionLiquid = readFileSync(
      join(root, 'snippets/frame-assets.liquid'),
      'utf8',
    );
    expect(productionLiquid).toContain("'frame-theme.js' | asset_url");
    expect(productionLiquid).not.toContain('/@vite/client');
  });
});

describe('Frame production build', () => {
  it('builds TypeScript and CSS into a root-level Shopify theme', async () => {
    const root = themeProject();
    writeFileSync(
      join(root, 'src/main.ts'),
      "import {message} from './shared'; import('./lazy'); console.log(message);",
    );
    writeFileSync(join(root, 'src/shared.ts'), "export const message = 'Frame';");
    writeFileSync(join(root, 'src/lazy.ts'), "export const lazy = 'loaded';");
    writeFileSync(join(root, 'src/style.css'), 'body { color: rgb(1 2 3); }');
    writeFileSync(join(root, 'assets/merchant.css'), '.merchant {}');

    await buildTheme(root);

    const assets = readdirSync(join(root, 'assets'));
    expect(assets).toContain('frame-theme.js');
    expect(assets).toContain('frame-theme.css');
    expect(assets).toContain('merchant.css');
    expect(assets.some((file) => /^frame-lazy-.*\.js$/.test(file))).toBe(true);

    const liquid = readFileSync(join(root, 'snippets/frame-assets.liquid'), 'utf8');
    expect(liquid).toContain("'frame-theme.css' | asset_url | stylesheet_tag");
    expect(liquid).toContain("'frame-theme.js' | asset_url");
    expect(liquid).not.toContain('/@vite/client');

    const ledger = ownershipLedger(root);
    expect(ledger.generated).toContain('assets/frame-theme.js');
    expect(ledger.generated).toContain('snippets/frame-assets.liquid');
  });

  it('removes only stale Frame-owned output', async () => {
    const root = themeProject();
    writeFileSync(join(root, 'src/main.ts'), "import('./lazy');");
    writeFileSync(join(root, 'src/lazy.ts'), "export const value = 'old';");
    writeFileSync(join(root, 'src/style.css'), 'body { color: black; }');
    writeFileSync(join(root, 'assets/merchant.js'), 'window.merchant = true;');

    await buildTheme(root);
    const staleChunk = readdirSync(join(root, 'assets')).find((file) =>
      /^frame-lazy-.*\.js$/.test(file),
    );
    expect(staleChunk).toBeDefined();

    writeFileSync(join(root, 'src/main.ts'), "console.log('no lazy chunk');");
    await buildTheme(root);

    expect(existsSync(join(root, 'assets', staleChunk!))).toBe(false);
    expect(existsSync(join(root, 'assets/merchant.js'))).toBe(true);
  });

  it('renders CSS owned by a statically imported shared chunk for every entry', async () => {
    const root = themeProject();
    writeFileSync(join(root, 'src/one.ts'), "import './shared'; console.log('one');");
    writeFileSync(join(root, 'src/two.ts'), "import './shared'; console.log('two');");
    writeFileSync(join(root, 'src/shared.ts'), "import './shared.css'; export const shared = true;");
    writeFileSync(join(root, 'src/shared.css'), '.shared { display: grid; }');

    await buildTheme(root, {
      bundles: {
        one: {script: 'one.ts'},
        two: {script: 'two.ts'},
      },
    });

    const liquid = readFileSync(join(root, 'snippets/frame-assets.liquid'), 'utf8');
    const branches = liquid.split(/\{% when '[^']+' %\}/).slice(1);
    expect(branches).toHaveLength(2);
    expect(branches.every((branch) => branch.includes('stylesheet_tag'))).toBe(true);
  });

  it('isolates ownership ledgers for multiple themes in one Vite project', async () => {
    const root = mkdtempSync(join(tmpdir(), 'frame-multiple-themes-'));
    mkdirSync(join(root, 'src'), {recursive: true});
    writeFileSync(join(root, 'src/main.ts'), "console.log('Frame');");
    writeFileSync(join(root, 'src/style.css'), 'body {}');

    for (const name of ['theme-a', 'theme-b']) {
      for (const directory of ['assets', 'layout', 'snippets']) {
        mkdirSync(join(root, name, directory), {recursive: true});
      }
      writeFileSync(
        join(root, name, 'layout/theme.liquid'),
        "{{ content_for_header }}{% render 'frame-assets' %}{{ content_for_layout }}",
      );
    }

    await buildTheme(root, {theme: 'theme-a'});
    writeFileSync(join(root, 'theme-b/assets/frame-theme.js'), 'merchant asset');
    writeFileSync(join(root, 'theme-b/snippets/frame-assets.liquid'), 'merchant snippet');

    await expect(buildTheme(root, {theme: 'theme-b'})).rejects.toThrow(
      'refusing to overwrite a file Frame does not own',
    );
    expect(readFileSync(join(root, 'theme-b/assets/frame-theme.js'), 'utf8')).toBe(
      'merchant asset',
    );
  });

  it('refuses to overwrite a pre-existing unowned asset', async () => {
    const root = themeProject();
    writeFileSync(join(root, 'src/main.ts'), 'console.log(\'Frame\');');
    writeFileSync(join(root, 'src/style.css'), 'body {}');
    writeFileSync(join(root, 'assets/frame-theme.js'), 'window.existing = true;');

    await expect(buildTheme(root)).rejects.toThrow(
      'refusing to overwrite a file Frame does not own',
    );
    expect(readFileSync(join(root, 'assets/frame-theme.js'), 'utf8')).toBe(
      'window.existing = true;',
    );
  });

  it('refuses to overwrite an unowned Liquid snippet during development', () => {
    const root = themeProject();
    writeFileSync(join(root, 'src/main.ts'), 'console.log(\'Frame\');');
    writeFileSync(join(root, 'src/style.css'), 'body {}');
    writeFileSync(join(root, 'snippets/frame-assets.liquid'), 'merchant snippet');
    const options = resolveFrameOptions({}, root);

    expect(() =>
      writeDevelopmentLiquid(
        options,
        renderDevelopmentLiquid(['theme'], 'http://localhost:5173'),
      ),
    ).toThrow('refusing to overwrite a Liquid file Frame does not own');
    expect(readFileSync(join(root, 'snippets/frame-assets.liquid'), 'utf8')).toBe(
      'merchant snippet',
    );
  });

  it('rejects Vite output settings that conflict with Frame ownership', async () => {
    const root = themeProject();
    writeFileSync(join(root, 'src/main.ts'), 'console.log(\'Frame\');');
    writeFileSync(join(root, 'src/style.css'), 'body {}');

    await expect(
      build({
        root,
        configFile: false,
        logLevel: 'silent',
        build: {assetsDir: 'custom-assets'},
        plugins: [frame()],
      }),
    ).rejects.toThrow('build.assetsDir is managed by Frame');
  });
});
