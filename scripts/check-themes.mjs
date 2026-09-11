import {execFileSync} from 'node:child_process';
import {copyFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {exampleDirectories, repositoryRoot} from './example-directories.mjs';

const themes = [resolve(repositoryRoot, 'scaffolds/theme'), ...exampleDirectories()];
function check(theme) {
  execFileSync('shopify', ['theme', 'check', '--path', theme, '--fail-level', 'error'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}
for (const theme of themes) check(theme);

const packageRoot = resolve(repositoryRoot, 'packages/create-easel');
execFileSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['build'], {
  cwd: packageRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
const temporary = mkdtempSync(join(tmpdir(), 'easel-created-theme-check-'));
try {
  // React and Vue use the same Liquid as the framework-neutral starter.
  for (const framework of ['none', 'alpine'])
    for (const tailwind of [false, true]) {
      const theme = join(temporary, `${framework}-${tailwind ? 'tailwind' : 'css'}`);
      execFileSync(
        process.execPath,
        [
          join(packageRoot, 'bin/create-easel.mjs'),
          theme,
          '--yes',
          '--no-install',
          '--framework',
          framework,
          tailwind ? '--tailwind' : '--no-tailwind',
        ],
        {stdio: 'inherit'},
      );
      // Production loader generation is exercised by the packed-package build matrix.
      copyFileSync(
        join(repositoryRoot, 'scaffolds/theme/snippets/easel-assets.liquid'),
        join(theme, 'snippets/easel-assets.liquid'),
      );
      check(theme);
    }
} finally {
  rmSync(temporary, {recursive: true, force: true});
}
