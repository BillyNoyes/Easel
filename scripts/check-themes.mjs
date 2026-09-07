import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {exampleDirectories, repositoryRoot} from './example-directories.mjs';

const themes = [resolve(repositoryRoot, 'scaffolds/theme'), ...exampleDirectories()];
for (const theme of themes) {
  execFileSync('shopify', ['theme', 'check', '--path', theme, '--fail-level', 'error'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}
