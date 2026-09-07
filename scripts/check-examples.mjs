import {execFileSync} from 'node:child_process';
import {exampleDirectories} from './example-directories.mjs';

const pnpmScript = process.env.npm_execpath;
if (pnpmScript === undefined) {
  throw new Error('[frame] example checks must be run through pnpm');
}

for (const directory of exampleDirectories()) {
  execFileSync(process.execPath, [pnpmScript, '--dir', directory, 'check'], {
    stdio: 'inherit',
  });
}
