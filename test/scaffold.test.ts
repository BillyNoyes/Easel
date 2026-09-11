import {execFileSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, readdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import {describe, expect, it} from 'vitest';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = join(repositoryRoot, 'scripts/scaffold-theme.mjs');
const shopifyDirectories = [
  'assets',
  'blocks',
  'config',
  'layout',
  'locales',
  'sections',
  'snippets',
  'src',
  'templates',
];

describe('theme scaffolder', () => {
  it('creates and builds a framework-neutral Shopify theme', async () => {
    const parent = mkdtempSync(join(repositoryRoot, '.easel-scaffold-test-'));
    const target = join(parent, 'svelte');

    try {
      execFileSync(process.execPath, [scriptPath, target, '--name', 'Easel Svelte']);

      for (const directory of shopifyDirectories) {
        expect(existsSync(join(target, directory))).toBe(true);
      }
      expect(
        JSON.parse(readFileSync(join(target, 'package.json'), 'utf8')),
      ).toMatchObject({
        name: 'easel-example-svelte',
        scripts: {build: 'vite build', dev: 'vite'},
      });
      expect(readFileSync(join(target, 'config/settings_schema.json'), 'utf8')).toContain(
        'Easel Svelte',
      );
      expect(readFileSync(join(target, 'vite.config.ts'), 'utf8')).toContain(
        "src/index.js'",
      );

      const generatedFiles = readdirSync(target, {recursive: true}) as string[];
      for (const file of generatedFiles) {
        const path = join(target, file);
        if (!existsSync(path) || !file.includes('.')) continue;
        const content = readFileSync(path, 'utf8');
        expect(content).not.toMatch(/__(EASEL_IMPORT|PACKAGE_NAME|THEME_NAME)__/);
      }

      await build({configFile: join(target, 'vite.config.ts'), logLevel: 'silent'});
      expect(existsSync(join(target, 'assets/easel-theme.js'))).toBe(true);
      expect(existsSync(join(target, 'assets/easel-theme.css'))).toBe(true);
    } finally {
      rmSync(parent, {recursive: true, force: true});
    }
  });

  it('refuses to overwrite an existing target', () => {
    const target = mkdtempSync(join(tmpdir(), 'easel-scaffold-existing-'));

    expect(() =>
      execFileSync(process.execPath, [scriptPath, target], {stdio: 'pipe'}),
    ).toThrow('scaffold target already exists');
  });
});
