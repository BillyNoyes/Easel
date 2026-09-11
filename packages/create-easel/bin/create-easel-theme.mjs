#!/usr/bin/env node

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  console.error('create-easel-theme requires Node.js 22.12.0 or newer.');
  process.exitCode = 1;
} else {
  await import('../dist/cli.js');
}
