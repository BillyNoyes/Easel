import {spawn, spawnSync} from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {generateTheme} from '../packages/create-easel/src/generate.ts';
import {
  defaultName,
  detectPackageManager,
  parseArguments,
  packageNameFor,
} from '../packages/create-easel/src/options.ts';
import {
  changeDirectoryCommand,
  installArguments,
} from '../packages/create-easel/src/install.ts';

const cli = resolve('packages/create-easel/bin/create-easel-theme.mjs');
const temporary = [];
function directory() {
  const path = mkdtempSync(join(tmpdir(), 'easel-create-test-'));
  temporary.push(path);
  return path;
}
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, {recursive: true, force: true});
});

function run(args, options = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    timeout: 15000,
    ...options,
  });
}
const variants = ['ts', 'js'].flatMap((language) =>
  ['none', 'alpine', 'react', 'vue'].flatMap((framework) =>
    [false, true].map((tailwind) => ({language, framework, tailwind})),
  ),
);
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
const storefrontSections = [
  'contact-form.liquid',
  'hero.liquid',
  'main-404.liquid',
  'main-article.liquid',
  'main-blog.liquid',
  'main-cart.liquid',
  'main-collection.liquid',
  'main-list-collections.liquid',
  'main-page.liquid',
  'main-password.liquid',
  'main-product.liquid',
  'main-search.liquid',
];

describe('public theme generator', () => {
  it.each(
    variants.flatMap((variant) =>
      ['new', 'existing'].map((mode) => ({...variant, mode})),
    ),
  )(
    'generates $language / $framework / tailwind=$tailwind in a $mode directory',
    (options) => {
      const target = join(directory(), 'My Theme');
      if (options.mode === 'existing') mkdirSync(target);
      generateTheme({...options, target, name: 'My Theme'});
      const manifest = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
      expect(manifest.name).toBe('my-theme');
      expect(manifest.devDependencies['vite-plugin-shopify-easel']).toBe('0.2.0');
      expect(manifest.scripts.dev).toBe('vite');
      expect(manifest.scripts.build).toBe('vite build');
      expect(Boolean(manifest.devDependencies.typescript)).toBe(
        options.language === 'ts',
      );
      expect(Boolean(manifest.devDependencies.tailwindcss)).toBe(options.tailwind);
      for (const framework of ['react', 'alpinejs', 'vue']) {
        expect(Boolean(manifest.dependencies?.[framework])).toBe(
          framework === (options.framework === 'alpine' ? 'alpinejs' : options.framework),
        );
      }
      const main = `src/main.${options.language}${options.framework === 'react' ? 'x' : ''}`;
      expect(existsSync(join(target, main))).toBe(true);
      expect(readFileSync(join(target, main), 'utf8')).toContain(
        'import.meta.hot.dispose',
      );
      expect(
        readFileSync(join(target, `vite.config.${options.language}`), 'utf8'),
      ).toContain("from 'vite-plugin-shopify-easel'");
      if (options.framework === 'react') {
        expect(readFileSync(join(target, main), 'utf8')).toContain(
          '@vitejs/plugin-react/preamble',
        );
        expect(existsSync(join(target, `src/main.${options.language}`))).toBe(false);
      }
      expect(readFileSync(join(target, '.gitignore'), 'utf8')).toContain(
        'easel-assets.liquid',
      );
      for (const file of readdirSync(target, {recursive: true})) {
        const path = join(target, file);
        if (!lstatSync(path).isFile()) continue;
        expect(readFileSync(path, 'utf8')).not.toMatch(
          /__(?:THEME_NAME|PACKAGE_NAME|EASEL_IMPORT)__/,
        );
        if (options.language === 'js') expect(file).not.toMatch(/\.tsx?$/);
      }
      expect(existsSync(join(target, 'assets/easel.svg'))).toBe(true);
      expect(existsSync(join(target, 'snippets/counter.liquid'))).toBe(true);
      expect(existsSync(join(target, 'snippets/product-card.liquid'))).toBe(true);
      expect(readdirSync(join(target, 'templates')).sort()).toEqual(storefrontTemplates);
      expect(readdirSync(join(target, 'sections')).sort()).toEqual(storefrontSections);
      expect(readdirSync(join(target, 'layout')).sort()).toEqual([
        'password.liquid',
        'theme.liquid',
      ]);
      for (const filename of storefrontTemplates.filter((name) =>
        name.endsWith('.json'),
      )) {
        const template = JSON.parse(
          readFileSync(join(target, 'templates', filename), 'utf8'),
        );
        expect(template.order).toEqual(Object.keys(template.sections));
        for (const section of Object.values(template.sections)) {
          expect(existsSync(join(target, 'sections', `${section.type}.liquid`))).toBe(
            true,
          );
        }
        if (template.layout) {
          expect(existsSync(join(target, 'layout', `${template.layout}.liquid`))).toBe(
            true,
          );
        }
      }
      for (const layout of ['theme.liquid', 'password.liquid']) {
        const liquid = readFileSync(join(target, 'layout', layout), 'utf8');
        expect(liquid).toContain('{{ content_for_header }}');
        expect(liquid).toContain('{{ content_for_layout }}');
      }
      expect(readFileSync(join(target, 'templates/gift_card.liquid'), 'utf8')).toContain(
        '{% layout none %}',
      );
      expect(existsSync(join(target, 'templates/customers'))).toBe(false);
      expect(existsSync(join(target, 'node_modules'))).toBe(false);
    },
    // Allow for filesystem contention on shared CI runners.
    15000,
  );

  it('refuses nonempty directories and preserves their contents', () => {
    const target = directory();
    writeFileSync(join(target, 'keep.txt'), 'keep');
    expect(() =>
      generateTheme({
        target,
        name: 'Example',
        language: 'ts',
        framework: 'none',
        tailwind: false,
      }),
    ).toThrow('Target already exists');
    expect(readFileSync(join(target, 'keep.txt'), 'utf8')).toBe('keep');
    expect(readdirSync(target)).toEqual(['keep.txt']);
  });

  it.skipIf(process.platform === 'win32')(
    'refuses symlinks, including dangling targets',
    () => {
      const parent = directory();
      for (const name of ['real', 'missing']) {
        if (name === 'real') mkdirSync(join(parent, name));
        const target = join(parent, `link-${name}`);
        symlinkSync(join(parent, name), target);
        expect(() =>
          generateTheme({
            target,
            name: 'Example',
            language: 'ts',
            framework: 'none',
            tailwind: false,
          }),
        ).toThrow('Target already exists');
        expect(lstatSync(target).isSymbolicLink()).toBe(true);
      }
    },
  );

  it.each(['directory', 'file'])('preserves .git as a %s and .DS_Store', (kind) => {
    const target = directory();
    const git = join(target, '.git');
    if (kind === 'directory') mkdirSync(git);
    const metadata = kind === 'directory' ? join(git, 'config') : git;
    writeFileSync(metadata, 'Existing Git metadata');
    writeFileSync(join(target, '.DS_Store'), 'Existing Finder metadata');
    const inode = lstatSync(target).ino;
    generateTheme({
      target,
      name: 'Example',
      language: 'ts',
      framework: 'none',
      tailwind: false,
    });
    expect(lstatSync(target).ino).toBe(inode);
    expect(readFileSync(metadata, 'utf8')).toBe('Existing Git metadata');
    expect(readFileSync(join(target, '.DS_Store'), 'utf8')).toBe(
      'Existing Finder metadata',
    );
    expect(existsSync(join(target, 'package.json'))).toBe(true);
  });

  it('leaves an existing directory untouched when template rendering fails', () => {
    const target = directory();
    writeFileSync(join(target, '.git'), 'gitdir: existing-worktree');
    const inode = lstatSync(target).ino;
    expect(() =>
      generateTheme(
        {target, name: 'Example', language: 'ts', framework: 'none', tailwind: false},
        join(target, 'missing-templates'),
      ),
    ).toThrow();
    expect(lstatSync(target).ino).toBe(inode);
    expect(readdirSync(target)).toEqual(['.git']);
    expect(readFileSync(join(target, '.git'), 'utf8')).toBe('gitdir: existing-worktree');
  });

  it('cleans only its own target after a copy failure', () => {
    const parent = directory();
    writeFileSync(join(parent, 'keep.txt'), 'keep');
    const target = join(parent, 'new-theme');
    expect(() =>
      generateTheme(
        {target, name: 'Example', language: 'ts', framework: 'none', tailwind: false},
        join(parent, 'missing-templates'),
      ),
    ).toThrow();
    expect(readdirSync(parent)).toEqual(['keep.txt']);
  });
});

describe('CLI arguments and automation', () => {
  it('supports explicit negative flags and package-manager selection', () => {
    expect(
      parseArguments([
        'theme',
        '--language',
        'js',
        '--framework',
        'vue',
        '--tailwind',
        '--no-install',
        '--no-interactive',
        '--package-manager',
        'pnpm',
      ]),
    ).toMatchObject({
      target: 'theme',
      language: 'js',
      framework: 'vue',
      tailwind: true,
      install: false,
      interactive: false,
      'package-manager': 'pnpm',
    });
  });
  it.each([
    ['--framework', 'svelte'],
    ['--language', 'coffee'],
    ['--package-manager', 'sh'],
    ['--name', 'Bad\nName'],
    ['--unknown'],
    ['one', 'two'],
  ])('rejects invalid arguments %j', (...args) => {
    expect(() => parseArguments(args)).toThrow();
  });
  it('normalizes package names and detects only supported managers', () => {
    expect(packageNameFor('/tmp/My Theme')).toBe('my-theme');
    expect(defaultName('/tmp/my-theme')).toBe('My Theme');
    expect(detectPackageManager('pnpm/10.28.0 npm/?')).toBe('pnpm');
    expect(detectPackageManager('bun/1.3.0')).toBe('bun');
    expect(detectPackageManager('unknown/1.0')).toBe('npm');
    expect(() => packageNameFor('NUL')).toThrow('reserved');
    expect(() => packageNameFor('bad\nname')).toThrow('control');
  });
  it('does not prompt or install in non-interactive mode', () => {
    const target = join(directory(), 'theme with spaces');
    const result = run([target], {env: {...process.env, PATH: ''}});
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(join(target, 'package.json'))).toBe(true);
    expect(existsSync(join(target, 'node_modules'))).toBe(false);
    expect(result.stdout).toContain('Shopify CLI must be installed');
  });
  it('creates directly in the current directory when given a dot', () => {
    const cwd = directory();
    writeFileSync(join(cwd, '.git'), 'gitdir: existing-worktree');
    const result = run(['.', '--yes', '--no-install'], {cwd});
    expect(result.status, result.stderr).toBe(0);
    const manifest = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
    expect(manifest.name).toBe(packageNameFor(cwd));
    expect(existsSync(join(cwd, 'my-theme'))).toBe(false);
    expect(readFileSync(join(cwd, '.git'), 'utf8')).toBe('gitdir: existing-worktree');
    expect(result.stdout).not.toMatch(/^cd |^Set-Location /m);
  });
  it('rejects a populated current directory without modifying it', () => {
    const cwd = directory();
    writeFileSync(join(cwd, 'package.json'), '{"name":"existing-project"}');
    const result = run(['.', '--yes', '--no-install'], {cwd});
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('not empty');
    expect(readdirSync(cwd)).toEqual(['package.json']);
    expect(readFileSync(join(cwd, 'package.json'), 'utf8')).toBe(
      '{"name":"existing-project"}',
    );
  });
  it('requires an explicit directory without a terminal', () => {
    const result = run([], {cwd: directory()});
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Provide a directory');
  });
  it('prints help and version without generating files', () => {
    const cwd = directory();
    const help = run(['--help'], {cwd});
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('Usage: create-easel-theme <directory> [options]');
    expect(help.stdout).toContain('--no-interactive');
    expect(run(['--version'], {cwd}).stdout.trim()).toBe('0.2.0');
    expect(readdirSync(cwd)).toEqual([]);
  });
  it('rejects forced interaction without a terminal', () => {
    const result = run(['theme', '--interactive'], {cwd: directory()});
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('requires a terminal');
  });
  it('runs the selected installer in the new theme and reports success', () => {
    const parent = directory();
    const executable = join(parent, process.platform === 'win32' ? 'npm.cmd' : 'npm');
    writeFileSync(
      executable,
      process.platform === 'win32'
        ? '@echo off\r\necho %CD%>installation-directory.txt\r\nexit /b 0\r\n'
        : '#!/bin/sh\npwd > installation-directory.txt\nexit 0\n',
      {mode: 0o755},
    );
    const target = join(parent, 'theme with spaces');
    const result = run([target, '--yes', '--install', '--package-manager', 'npm'], {
      env: {...process.env, PATH: parent},
    });
    expect(result.status, result.stderr).toBe(0);
    expect(
      readFileSync(join(target, 'installation-directory.txt'), 'utf8').trim(),
    ).toMatch(/theme with spaces$/);
    expect(result.stdout).toContain('npm run dev');
    expect(result.stdout).not.toContain('npm install');
  });
  it('preserves generated files and reports failed installation', () => {
    const parent = directory();
    const executable = join(parent, process.platform === 'win32' ? 'npm.cmd' : 'npm');
    writeFileSync(
      executable,
      process.platform === 'win32'
        ? '@echo off\r\necho Installer fixture failed 1>&2\r\nexit /b 17\r\n'
        : '#!/bin/sh\necho "Installer fixture failed" >&2\nexit 17\n',
      {mode: 0o755},
    );
    const target = join(parent, 'theme');
    const result = run([target, '--yes', '--install', '--package-manager', 'npm'], {
      env: {...process.env, PATH: parent},
    });
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain('Your theme files have been kept');
    expect(result.stderr).toContain('Installer fixture failed');
    expect(result.stdout).toContain('npm install');
    expect(existsSync(join(target, 'src/main.ts'))).toBe(true);
  });
  it.skipIf(process.platform === 'win32')(
    'keeps files when installation is cancelled',
    async () => {
      const parent = directory();
      writeFileSync(
        join(parent, 'npm'),
        '#!/bin/sh\ntrap "exit 130" INT\nprintf "INSTALL_WAITING\\n"\n/bin/sleep 2\n',
        {mode: 0o755},
      );
      const target = join(parent, 'theme');
      const child = spawn(
        process.execPath,
        [cli, target, '--yes', '--install', '--package-manager', 'npm'],
        {env: {...process.env, PATH: parent}, timeout: 10000},
      );
      let output = '';
      let interrupted = false;
      child.stdout.on('data', (chunk) => {
        output += chunk.toString();
        if (output.includes('INSTALL_WAITING') && !interrupted) {
          interrupted = true;
          child.kill('SIGINT');
        }
      });
      let errors = '';
      child.stderr.on('data', (chunk) => {
        errors += chunk.toString();
      });
      const result = await new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('close', (code, signal) => resolve({code, signal}));
      });
      expect(result, `${errors}\n${output}`).toEqual({code: 130, signal: null});
      expect(errors).toContain('Your theme files have been kept');
      expect(existsSync(join(target, 'package.json'))).toBe(true);
    },
    15000,
  );
  it('isolates pnpm installation from ancestor workspaces', () => {
    expect(installArguments('pnpm')).toEqual(['install', '--ignore-workspace']);
    expect(installArguments('npm')).toEqual(['install']);
  });
  it('quotes next-step paths for POSIX shells and PowerShell', () => {
    expect(changeDirectoryCommand("/tmp/a'$(echo bad)", 'linux')).toBe(
      "cd '/tmp/a'\\''$(echo bad)'",
    );
    expect(changeDirectoryCommand("C:\\a'b", 'win32')).toBe(
      "Set-Location -LiteralPath 'C:\\a''b'",
    );
  });
});
