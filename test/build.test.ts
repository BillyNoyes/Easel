import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {build, createServer} from 'vite';
import {describe, expect, it} from 'vitest';
import {frame} from '../src/index.js';
import {renderDevelopmentLiquid} from '../src/liquid.js';
import {resolveFrameOptions} from '../src/options.js';
import {commitProductionOutput, writeDevelopmentLiquid} from '../src/output.js';
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
    "<!doctype html>\n<html><head>{{ content_for_header }}\n{% render 'frame-assets' %}\n</head><body>{{ content_for_layout }}</body></html>\n",
  );
  return root;
}

async function buildTheme(root: string, options: FrameOptions = {}): Promise<void> {
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

    expect(existsSync(join(root, 'snippets/frame-assets.liquid'))).toBe(false);

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
  it('leaves configured script source unchanged for other Vite transforms', async () => {
    const root = themeProject();
    const source = "'use client';\nconsole.log('Frame');\n";
    writeFileSync(join(root, 'src/main.ts'), source);
    writeFileSync(join(root, 'src/style.css'), 'body {}');
    let transformedSource: string | undefined;

    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [
        frame(),
        {
          name: 'inspect-frame-entry',
          enforce: 'pre',
          transform(code, id) {
            if (id.endsWith('/src/main.ts')) transformedSource = code;
          },
        },
      ],
    });

    expect(transformedSource).toBe(source);
  });

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

  it('publishes source maps and imported static assets emitted by Vite', async () => {
    const root = themeProject();
    writeFileSync(
      join(root, 'src/main.ts'),
      "import icon from './icon.svg'; console.log(icon);",
    );
    writeFileSync(
      join(root, 'src/style.css'),
      ".icon { background: url('./icon.svg'); }",
    );
    writeFileSync(
      join(root, 'src/icon.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h100v100H0z"/></svg>',
    );

    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      build: {assetsInlineLimit: 0, sourcemap: true},
      plugins: [frame()],
    });

    const assets = readdirSync(join(root, 'assets'));
    const icon = assets.find((file) => /^frame-icon-.*\.svg$/.test(file));
    expect(icon).toBeDefined();
    expect(assets).toContain('frame-theme.js.map');
    expect(readFileSync(join(root, 'assets/frame-theme.js'), 'utf8')).toContain(
      '//# sourceMappingURL=frame-theme.js.map',
    );
    const ledger = ownershipLedger(root);
    expect(ledger.generated).toContain('assets/frame-theme.js.map');
    expect(ledger.generated).toContain(`assets/${icon!}`);
  });

  it('restores the production Liquid snippet after development stops', async () => {
    const root = themeProject();
    writeFileSync(join(root, 'src/main.ts'), "console.log('Frame');");
    writeFileSync(join(root, 'src/style.css'), 'body {}');
    await buildTheme(root);
    const production = readFileSync(join(root, 'snippets/frame-assets.liquid'), 'utf8');

    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: {port: 0},
      plugins: [frame()],
    });
    await server.listen();
    expect(readFileSync(join(root, 'snippets/frame-assets.liquid'), 'utf8')).toContain(
      '/@vite/client',
    );
    await server.close();

    expect(readFileSync(join(root, 'snippets/frame-assets.liquid'), 'utf8')).toBe(
      production,
    );
  });

  it('migrates Liquid-suffixed production backups out of Theme Check scope', async () => {
    const root = themeProject();
    writeFileSync(join(root, 'src/main.ts'), "console.log('Frame');");
    writeFileSync(join(root, 'src/style.css'), 'body {}');
    await buildTheme(root);
    const options = resolveFrameOptions({}, root);
    const legacyPath = join(dirname(options.productionLiquidPath), 'production.liquid');
    renameSync(options.productionLiquidPath, legacyPath);

    await buildTheme(root);

    expect(existsSync(legacyPath)).toBe(false);
    expect(existsSync(options.productionLiquidPath)).toBe(true);
    expect(options.productionLiquidPath.endsWith('production.txt')).toBe(true);
  });

  it('recovers the production Liquid snippet after an interrupted dev session', async () => {
    const root = themeProject();
    writeFileSync(join(root, 'src/main.ts'), "console.log('Frame');");
    writeFileSync(join(root, 'src/style.css'), 'body {}');
    await buildTheme(root);
    const options = resolveFrameOptions({}, root);
    const production = readFileSync(options.liquidPath, 'utf8');
    rmSync(options.productionLiquidPath);
    const development = renderDevelopmentLiquid(['theme'], 'http://localhost:5173');

    writeDevelopmentLiquid(options, development);
    const restoreAfterRestart = writeDevelopmentLiquid(options, development);
    restoreAfterRestart();

    expect(readFileSync(options.liquidPath, 'utf8')).toBe(production);
  });

  it('recovers files recorded by an interrupted commit journal', async () => {
    const root = themeProject();
    writeFileSync(join(root, 'src/main.ts'), "console.log('old');");
    writeFileSync(join(root, 'src/style.css'), 'body {}');
    await buildTheme(root);
    const options = resolveFrameOptions({}, root);
    const assetPath = join(root, 'assets/frame-theme.js');
    const previous = readFileSync(assetPath);
    mkdirSync(options.transactionPath, {recursive: true});
    writeFileSync(join(options.transactionPath, '0.bin'), previous);
    writeFileSync(
      join(options.transactionPath, 'journal.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        themePath: options.themePath,
        entries: [
          {
            scope: 'theme',
            path: 'assets/frame-theme.js',
            existed: true,
            blob: '0.bin',
          },
        ],
      })}\n`,
    );
    writeFileSync(assetPath, 'partially published');

    expect(() =>
      commitProductionOutput(
        options,
        {schemaVersion: 1, entries: {}, generated: ['frame-missing.js']},
        'unused',
      ),
    ).toThrow('generated Vite asset is missing');
    expect(readFileSync(assetPath).equals(previous)).toBe(true);
    expect(existsSync(options.transactionPath)).toBe(false);
  });

  it('rejects an interrupted journal that targets source-controlled theme files', () => {
    const root = themeProject();
    writeFileSync(join(root, 'src/main.ts'), "console.log('Frame');");
    writeFileSync(join(root, 'src/style.css'), 'body {}');
    const options = resolveFrameOptions({}, root);
    mkdirSync(options.transactionPath, {recursive: true});
    writeFileSync(
      join(options.transactionPath, 'journal.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        themePath: options.themePath,
        entries: [
          {
            scope: 'theme',
            path: 'layout/theme.liquid',
            existed: false,
          },
        ],
      })}\n`,
    );

    expect(() =>
      commitProductionOutput(
        options,
        {schemaVersion: 1, entries: {}, generated: []},
        'unused',
      ),
    ).toThrow('transaction journal contains an invalid path');
    expect(existsSync(join(root, 'layout/theme.liquid'))).toBe(true);
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

  it('content-hashes dynamic CSS whose chunk name collides with its bundle', async () => {
    const root = themeProject();
    writeFileSync(join(root, 'src/main.ts'), "import('./product');");
    writeFileSync(join(root, 'src/style.css'), 'body {}');
    writeFileSync(join(root, 'src/product.ts'), "import './product.css';");
    writeFileSync(join(root, 'src/product.css'), '.product { color: red; }');
    const bundles = {
      product: {script: 'main.ts', style: 'style.css'},
    };

    await buildTheme(root, {bundles});
    const first = readdirSync(join(root, 'assets')).find((file) =>
      /^frame-product\d*-.*\.css$/.test(file),
    );
    expect(first).toBeDefined();

    writeFileSync(join(root, 'src/product.css'), '.product { color: blue; }');
    await buildTheme(root, {bundles});
    const second = readdirSync(join(root, 'assets')).find((file) =>
      /^frame-product\d*-.*\.css$/.test(file),
    );

    expect(second).toBeDefined();
    expect(second).not.toBe(first);
    expect(existsSync(join(root, 'assets', first!))).toBe(false);
  });

  it('renders CSS owned by a statically imported shared chunk for every entry', async () => {
    const root = themeProject();
    writeFileSync(join(root, 'src/one.ts'), "import './shared'; console.log('one');");
    writeFileSync(join(root, 'src/two.ts'), "import './shared'; console.log('two');");
    writeFileSync(
      join(root, 'src/shared.ts'),
      "import './shared.css'; export const shared = true;",
    );
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

  it('migrates legacy ownership metadata when the namespace changes', async () => {
    const root = themeProject();
    writeFileSync(join(root, 'src/main.ts'), "console.log('Frame');");
    writeFileSync(join(root, 'src/style.css'), 'body {}');
    await buildTheme(root);
    const themesPath = join(root, '.frame/themes');
    const themeDirectory = readdirSync(themesPath)[0]!;
    const ledgerPath = join(themesPath, themeDirectory, 'outputs.json');
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')) as Record<
      string,
      unknown
    >;
    ledger.schemaVersion = 1;
    delete ledger.prefix;
    delete ledger.liquidFilename;
    writeFileSync(ledgerPath, `${JSON.stringify(ledger)}\n`);

    await buildTheme(root, {namespace: 'shop'});

    expect(existsSync(join(root, 'assets/frame-theme.js'))).toBe(false);
    expect(existsSync(join(root, 'snippets/frame-assets.liquid'))).toBe(false);
    expect(existsSync(join(root, 'assets/shop-theme.js'))).toBe(true);
    expect(existsSync(join(root, 'snippets/shop-assets.liquid'))).toBe(true);
    expect(ownershipLedger(root).generated).toContain('assets/shop-theme.js');
  });

  it('migrates current ownership metadata when the namespace changes', async () => {
    const root = themeProject();
    writeFileSync(join(root, 'src/main.ts'), "console.log('Frame');");
    writeFileSync(join(root, 'src/style.css'), 'body {}');
    await buildTheme(root);

    await buildTheme(root, {namespace: 'studio'});

    expect(existsSync(join(root, 'assets/frame-theme.js'))).toBe(false);
    expect(existsSync(join(root, 'snippets/frame-assets.liquid'))).toBe(false);
    expect(existsSync(join(root, 'assets/studio-theme.js'))).toBe(true);
    expect(existsSync(join(root, 'snippets/studio-assets.liquid'))).toBe(true);
    expect(ownershipLedger(root)).toMatchObject({
      prefix: 'studio-',
      liquidFilename: 'studio-assets.liquid',
    });
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

  it('rejects a symlinked Shopify output directory', async () => {
    const root = themeProject();
    const external = mkdtempSync(join(tmpdir(), 'frame-external-assets-'));
    writeFileSync(join(root, 'src/main.ts'), "console.log('Frame');");
    writeFileSync(join(root, 'src/style.css'), 'body {}');
    rmSync(join(root, 'assets'), {recursive: true});
    symlinkSync(
      external,
      join(root, 'assets'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    await expect(buildTheme(root)).rejects.toThrow(
      'Shopify theme output directory cannot be a symbolic link',
    );
    expect(readdirSync(external)).toEqual([]);
  });

  it('rejects a ledger that claims a user-owned theme file', async () => {
    const root = themeProject();
    writeFileSync(join(root, 'src/main.ts'), "console.log('Frame');");
    writeFileSync(join(root, 'src/style.css'), 'body {}');
    await buildTheme(root);
    const themesPath = join(root, '.frame/themes');
    const themeDirectory = readdirSync(themesPath)[0]!;
    const ledgerPath = join(themesPath, themeDirectory, 'outputs.json');
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')) as {
      generated: string[];
    };
    ledger.generated.push('layout/theme.liquid');
    writeFileSync(ledgerPath, `${JSON.stringify(ledger)}\n`);

    await expect(buildTheme(root)).rejects.toThrow('invalid ownership ledger');
    expect(existsSync(join(root, 'layout/theme.liquid'))).toBe(true);
  });

  it('does not publish output when a later closeBundle hook fails', async () => {
    const root = themeProject();
    writeFileSync(join(root, 'src/main.ts'), "console.log('old');");
    writeFileSync(join(root, 'src/style.css'), 'body {}');
    await buildTheme(root);
    const assetPath = join(root, 'assets/frame-theme.js');
    const previous = readFileSync(assetPath);
    writeFileSync(join(root, 'src/main.ts'), "console.log('new');");

    await expect(
      build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [
          frame(),
          {
            name: 'fail-after-build',
            closeBundle() {
              throw new Error('later closeBundle failed');
            },
          },
        ],
      }),
    ).rejects.toThrow('later closeBundle failed');
    expect(readFileSync(assetPath).equals(previous)).toBe(true);
  });

  it('does not publish output when a writeBundle hook fails', async () => {
    const root = themeProject();
    writeFileSync(join(root, 'src/main.ts'), "console.log('old');");
    writeFileSync(join(root, 'src/style.css'), 'body {}');
    await buildTheme(root);
    const assetPath = join(root, 'assets/frame-theme.js');
    const previous = readFileSync(assetPath);
    writeFileSync(join(root, 'src/main.ts'), "console.log('new');");

    await expect(
      build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [
          frame(),
          {
            name: 'fail-output-write',
            writeBundle() {
              throw new Error('writeBundle failed');
            },
          },
        ],
      }),
    ).rejects.toThrow('writeBundle failed');
    expect(readFileSync(assetPath).equals(previous)).toBe(true);
  });

  it('rejects post-order build hooks that would run after Frame commits', async () => {
    const root = themeProject();
    writeFileSync(join(root, 'src/main.ts'), "console.log('old');");
    writeFileSync(join(root, 'src/style.css'), 'body {}');
    await buildTheme(root);
    const assetPath = join(root, 'assets/frame-theme.js');
    const previous = readFileSync(assetPath);
    writeFileSync(join(root, 'src/main.ts'), "console.log('new');");

    await expect(
      build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [
          frame(),
          {
            name: 'post-build-hook',
            enforce: 'post',
            closeBundle: {
              order: 'post',
              handler() {
                throw new Error('must not run');
              },
            },
          },
        ],
      }),
    ).rejects.toThrow('Move frame() after those plugins');
    expect(readFileSync(assetPath).equals(previous)).toBe(true);

    await expect(
      build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [
          {
            name: 'post-build-hook',
            enforce: 'post',
            closeBundle: {
              order: 'post',
              handler() {
                throw new Error('post hook failed');
              },
            },
          },
          frame(),
        ],
      }),
    ).rejects.toThrow('post hook failed');
    expect(readFileSync(assetPath).equals(previous)).toBe(true);
  });

  it('keeps concurrent builds isolated until each publishes', async () => {
    const root = themeProject();
    writeFileSync(join(root, 'src/main.ts'), "console.log('build-a');");
    writeFileSync(join(root, 'src/style.css'), 'body {}');
    let continueBuildA: (() => void) | undefined;
    let buildAReachedWrite: (() => void) | undefined;
    const reachedWrite = new Promise<void>((resolve) => {
      buildAReachedWrite = resolve;
    });
    const waitToContinue = new Promise<void>((resolve) => {
      continueBuildA = resolve;
    });

    const buildA = build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [
        {
          name: 'pause-build-a',
          async writeBundle() {
            buildAReachedWrite?.();
            await waitToContinue;
          },
        },
        frame(),
      ],
    });
    await reachedWrite;

    writeFileSync(join(root, 'src/main.ts'), "console.log('build-b');");
    await buildTheme(root);
    continueBuildA?.();
    await buildA;

    const published = readFileSync(join(root, 'assets/frame-theme.js'), 'utf8');
    expect(published).toContain('build-a');
    expect(published).not.toContain('build-b');
  });

  it('does not rewrite identical production output', async () => {
    const root = themeProject();
    writeFileSync(join(root, 'src/main.ts'), "console.log('Frame');");
    writeFileSync(join(root, 'src/style.css'), 'body {}');
    await buildTheme(root);
    const snippet = join(root, 'snippets/frame-assets.liquid');
    const modified = statSync(snippet).mtimeMs;
    await new Promise((resolve) => setTimeout(resolve, 20));

    await buildTheme(root);

    expect(statSync(snippet).mtimeMs).toBe(modified);
  });

  it('re-adopts identical generated output after local Frame state is cleared', async () => {
    const root = themeProject();
    writeFileSync(join(root, 'src/main.ts'), "console.log('Frame');");
    writeFileSync(join(root, 'src/style.css'), 'body {}');
    await buildTheme(root);
    rmSync(join(root, '.frame'), {recursive: true});

    await buildTheme(root);

    expect(existsSync(join(root, 'assets/frame-theme.js'))).toBe(true);
    expect(ownershipLedger(root).generated).toContain('assets/frame-theme.js');
  });

  it('refuses to overwrite a pre-existing unowned asset', async () => {
    const root = themeProject();
    writeFileSync(join(root, 'src/main.ts'), "console.log('Frame');");
    writeFileSync(join(root, 'src/style.css'), 'body {}');
    writeFileSync(join(root, 'assets/frame-theme.js'), 'window.existing = true;');

    await expect(buildTheme(root)).rejects.toThrow(
      'refusing to overwrite a file Frame does not own',
    );
    expect(readFileSync(join(root, 'assets/frame-theme.js'), 'utf8')).toBe(
      'window.existing = true;',
    );
  });

  it('rejects an unowned Liquid snippet before the development server starts', async () => {
    const root = themeProject();
    writeFileSync(join(root, 'src/main.ts'), "console.log('Frame');");
    writeFileSync(join(root, 'src/style.css'), 'body {}');
    writeFileSync(
      join(root, 'snippets/frame-assets.liquid'),
      '{% doc %}\nGenerated by a merchant and not managed by Frame.\n{% enddoc %}',
    );

    await expect(
      createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [frame()],
      }),
    ).rejects.toThrow('refusing to overwrite a Liquid file Frame does not own');
  });

  it('refuses to overwrite an unowned Liquid snippet during development', () => {
    const root = themeProject();
    writeFileSync(join(root, 'src/main.ts'), "console.log('Frame');");
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

  it('does not emit an empty JavaScript asset for a CSS-only bundle', async () => {
    const root = themeProject();
    writeFileSync(join(root, 'src/styles.css'), 'body { display: grid; }');

    await buildTheme(root, {bundles: {styles: {style: 'styles.css'}}});

    expect(readdirSync(join(root, 'assets'))).toContain('frame-styles.css');
    expect(readdirSync(join(root, 'assets'))).not.toContain('frame-styles.js');
    expect(
      readFileSync(join(root, 'snippets/frame-assets.liquid'), 'utf8'),
    ).not.toContain('frame-styles.js');
  });

  it('rejects output names changed by a later Vite plugin', async () => {
    const root = themeProject();
    writeFileSync(join(root, 'src/main.ts'), "console.log('Frame');");
    writeFileSync(join(root, 'src/style.css'), 'body {}');

    await expect(
      build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [
          frame(),
          {
            name: 'change-frame-output',
            enforce: 'post',
            config() {
              return {
                build: {
                  rollupOptions: {
                    output: {
                      entryFileNames: 'outside-[name].js',
                      assetFileNames: 'outside-[name][extname]',
                    },
                  },
                },
              };
            },
          },
        ],
      }),
    ).rejects.toThrow("generated asset is outside Frame's namespace");
    expect(readdirSync(join(root, 'assets'))).toEqual([]);
  });

  it('rejects Vite output settings that conflict with Frame ownership', async () => {
    const root = themeProject();
    writeFileSync(join(root, 'src/main.ts'), "console.log('Frame');");
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

    await expect(
      build({
        root,
        configFile: false,
        logLevel: 'silent',
        build: {write: false},
        plugins: [frame()],
      }),
    ).rejects.toThrow('build.write must remain enabled');
  });
});
