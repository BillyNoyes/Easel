#!/usr/bin/env node

import {access, readFile, readdir} from 'node:fs/promises';

await Promise.all([access('dist/assets/main.js'), access('dist/assets/site.css')]);

const [landing, docs, assets] = await Promise.all([
  readFile('dist/index.html', 'utf8'),
  readFile('dist/docs/index.html', 'utf8'),
  readdir('dist/assets'),
]);

for (const [name, html] of [
  ['landing', landing],
  ['docs', docs],
]) {
  if (!html.includes('assets/main.js') || !html.includes('assets/site.css')) {
    throw new Error(`${name} HTML must reference stable site assets`);
  }
}

if (assets.some((file) => /^(?:main|site)-[\w-]+\.(?:js|css)$/.test(file))) {
  throw new Error('site assets must not use content-hashed entry filenames');
}
