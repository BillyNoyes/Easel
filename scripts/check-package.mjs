#!/usr/bin/env node

import {execFile} from 'node:child_process';
import {mkdtemp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {validatePackageContents} from './package-contents.mjs';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const pnpmUsesShell = process.platform === 'win32';
const temporary = await mkdtemp(join(tmpdir(), 'easel-package-'));
const consumer = join(temporary, 'consumer');

try {
  await execFileAsync(pnpm, ['pack', '--pack-destination', temporary], {
    cwd: root,
    shell: pnpmUsesShell,
  });
  const tarballs = (await readdir(temporary)).filter((file) => file.endsWith('.tgz'));
  if (tarballs.length !== 1) throw new Error('expected pnpm pack to create one tarball');
  const tarball = join(temporary, tarballs[0]);

  const {stdout: tarballListing} = await execFileAsync('tar', ['-tzf', tarball]);
  validatePackageContents(tarballListing);

  for (const directory of ['assets', 'layout', 'sections', 'snippets', 'src']) {
    await mkdir(join(consumer, directory), {recursive: true});
  }
  await Promise.all([
    writeFile(
      join(consumer, 'package.json'),
      `${JSON.stringify(
        {
          name: 'easel-package-consumer',
          private: true,
          type: 'module',
          dependencies: {
            'vite-plugin-shopify-easel': `file:../${tarballs[0]}`,
            vite: '^8.0.0',
          },
        },
        null,
        2,
      )}\n`,
    ),
    writeFile(
      join(consumer, 'vite.config.mjs'),
      "import {defineConfig} from 'vite';\nimport {easel} from 'vite-plugin-shopify-easel';\n\nexport default defineConfig({plugins: [easel()]});\n",
    ),
    writeFile(join(consumer, 'src/main.ts'), "console.log('Easel package consumer');\n"),
    writeFile(join(consumer, 'src/style.css'), 'body { color: rebeccapurple; }\n'),
    writeFile(
      join(consumer, 'layout/theme.liquid'),
      "{% render 'easel-assets' %}{{ content_for_layout }}\n",
    ),
  ]);

  await execFileAsync(pnpm, ['install', '--ignore-scripts', '--prefer-offline'], {
    cwd: consumer,
    shell: pnpmUsesShell,
  });
  await execFileAsync(pnpm, ['exec', 'vite', 'build'], {
    cwd: consumer,
    shell: pnpmUsesShell,
  });

  const [javascript, stylesheet, liquid] = await Promise.all([
    readFile(join(consumer, 'assets/easel-theme.js'), 'utf8'),
    readFile(join(consumer, 'assets/easel-theme.css'), 'utf8'),
    readFile(join(consumer, 'snippets/easel-assets.liquid'), 'utf8'),
  ]);
  if (!javascript.includes('Easel package consumer')) {
    throw new Error('installed package did not build the consumer script');
  }
  if (!stylesheet.includes('body')) {
    throw new Error('installed package did not build the consumer stylesheet');
  }
  if (!liquid.includes("'easel-theme.js' | asset_url")) {
    throw new Error('installed package did not generate the Liquid loader');
  }

  console.log(`Verified install and build from ${tarballs[0]}`);
} finally {
  await rm(temporary, {recursive: true, force: true});
}
