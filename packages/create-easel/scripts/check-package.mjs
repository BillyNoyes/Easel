import spawn from 'cross-spawn';
import {mkdtemp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'easel create package '));
const storefrontTemplates = [
  '404.json',
  'article.json',
  'blog.json',
  'cart.json',
  'collection.json',
  'gift_card.liquid',
  'index.json',
  'list-collections.json',
  'page.contact.json',
  'page.json',
  'password.json',
  'product.json',
  'search.json',
];

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      timeout: 180000,
      env: {...process.env, CI: 'true'},
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve(output)
        : reject(new Error(`${command} ${args.join(' ')} failed (${code}):\n${output}`)),
    );
  });
}

try {
  await run('pnpm', ['pack', '--pack-destination', temporary], repositoryRoot);
  await run('pnpm', ['pack', '--pack-destination', temporary], packageRoot);
  const archives = (await readdir(temporary)).filter((name) => name.endsWith('.tgz'));
  const cliTarball = archives.find((name) => name.startsWith('create-easel-theme-'));
  const pluginTarball = archives.find((name) =>
    name.startsWith('vite-plugin-shopify-easel-'),
  );
  assert(cliTarball && pluginTarball);
  const listing = await run('tar', ['-tzf', join(temporary, cliTarball)], temporary);
  for (const path of [
    'bin/create-easel-theme.mjs',
    'dist/cli.js',
    'dist/templates/ts/base/_gitignore',
    'dist/templates/js/base/src/main.js',
    'dist/templates/js/react/src/main.jsx',
    'dist/templates/ts/vue/src/Counter.vue',
    'dist/templates/ts/base/layout/password.liquid',
    'dist/templates/ts/base/snippets/product-card.liquid',
    ...storefrontTemplates.map((name) => `dist/templates/ts/base/templates/${name}`),
  ]) {
    assert(
      listing.split(/\r?\n/).includes(`package/${path}`),
      `Missing packed file: ${path}`,
    );
  }
  for (const path of listing.trim().split(/\r?\n/)) {
    assert(
      /^package\/(?:bin\/|dist\/|package\.json$|README\.md$|LICENSE$)/.test(path),
      `Unexpected packed file: ${path}`,
    );
  }
  const consumer = join(temporary, 'consumer');
  await mkdir(consumer);
  await writeFile(
    join(consumer, 'package.json'),
    JSON.stringify({
      private: true,
      devDependencies: {
        'create-easel-theme': `file:../${cliTarball}`,
      },
    }),
  );
  await run('pnpm', ['install', '--ignore-scripts', '--ignore-workspace'], consumer);
  const cliManifest = JSON.parse(
    await readFile(
      join(consumer, 'node_modules/create-easel-theme/package.json'),
      'utf8',
    ),
  );
  assert.equal(cliManifest.name, 'create-easel-theme');
  assert.deepEqual(cliManifest.bin, {
    'create-easel-theme': 'bin/create-easel-theme.mjs',
  });
  assert.equal(cliManifest.repository.directory, 'packages/create-easel');

  const version = await run(
    'npm',
    [
      'exec',
      '--yes',
      '--package',
      join(temporary, cliTarball),
      '--',
      'create-easel-theme',
      '--version',
    ],
    consumer,
  );
  assert(version.includes('0.2.0'));

  for (const language of ['ts', 'js'])
    for (const framework of ['none', 'alpine', 'react', 'vue'])
      for (const tailwind of [false, true]) {
        const target = join(
          temporary,
          `${language} ${framework} ${tailwind ? 'tailwind' : 'css'}`,
        );
        const options = [
          '--yes',
          '--language',
          language,
          '--framework',
          framework,
          tailwind ? '--tailwind' : '--no-tailwind',
          '--no-install',
          '--package-manager',
          'pnpm',
        ];
        if (language === 'js') {
          await mkdir(target);
          await writeFile(join(target, '.git'), 'gitdir: existing-worktree');
          await run(
            'npm',
            [
              'exec',
              '--yes',
              '--package',
              join(temporary, cliTarball),
              '--',
              'create-easel-theme',
              '.',
              ...options,
            ],
            target,
          );
          assert.equal(
            await readFile(join(target, '.git'), 'utf8'),
            'gitdir: existing-worktree',
          );
        } else {
          await run('pnpm', ['exec', 'create-easel-theme', target, ...options], consumer);
        }
        const manifestPath = join(target, 'package.json');
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
        assert.equal(manifest.dependencies?.['create-easel-theme'], undefined);
        assert.equal(manifest.devDependencies?.['create-easel-theme'], undefined);
        assert.deepEqual(
          (await readdir(join(target, 'templates'))).sort(),
          storefrontTemplates,
        );
        assert.deepEqual((await readdir(join(target, 'layout'))).sort(), [
          'password.liquid',
          'theme.liquid',
        ]);
        assert.equal(manifest.devDependencies['vite-plugin-shopify-easel'], '0.2.0');
        manifest.devDependencies['vite-plugin-shopify-easel'] =
          `file:../${pluginTarball}`;
        await writeFile(manifestPath, JSON.stringify(manifest));
        await run(
          'pnpm',
          ['install', '--ignore-scripts', '--ignore-workspace', '--no-frozen-lockfile'],
          target,
        );
        await run('pnpm', ['run', 'check'], target);
        assert(
          (await readFile(join(target, 'assets/easel-theme.js'), 'utf8')).length > 0,
        );
        const css = await readFile(join(target, 'assets/easel-theme.css'), 'utf8');
        assert(css.includes('body'));
        if (tailwind) assert(css.includes('.rounded-xl'));
        const loader = await readFile(
          join(target, 'snippets/easel-assets.liquid'),
          'utf8',
        );
        assert(loader.includes("'easel-theme.js' | asset_url"));
        assert(!loader.includes('localhost'));
        assert(
          (await readFile(join(target, 'assets/easel.svg'), 'utf8')).includes('<svg'),
        );
        console.log(
          `Verified packed CLI: ${language} / ${framework} / ${tailwind ? 'Tailwind' : 'CSS'}`,
        );
      }
} finally {
  await rm(temporary, {recursive: true, force: true});
}
