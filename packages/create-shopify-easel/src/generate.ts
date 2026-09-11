import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateOptions, type ThemeOptions} from './options.js';
import {assertTargetDirectory} from './directory.js';
import {writeProject} from './write-project.js';
import {
  projectPackage,
  projectReadme,
  typescriptConfiguration,
  viteConfiguration,
} from './project.js';

const templates = fileURLToPath(new URL('../dist/templates/', import.meta.url));

export function generateTheme(options: ThemeOptions, templateRoot = templates): string {
  validateOptions(options);
  const target = resolve(options.target);
  assertTargetDirectory(target);
  const staging = mkdtempSync(join(tmpdir(), 'easel-create-'));
  try {
    renderTheme(options, staging, templateRoot);
    writeProject(staging, target);
    return target;
  } finally {
    rmSync(staging, {recursive: true, force: true});
  }
}

function renderTheme(options: ThemeOptions, target: string, templateRoot: string): void {
  const source = join(templateRoot, options.language);
  cpSync(join(source, 'base'), target, {
    recursive: true,
    force: false,
    errorOnExist: true,
  });
  if (options.framework !== 'none') {
    rmSync(join(target, 'src', `main.${options.language}`));
    cpSync(join(source, options.framework), target, {recursive: true});
  }
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
    mkdirSync(join(target, directory), {recursive: true});
  }
  renameSync(join(target, '_gitignore'), join(target, '.gitignore'));
  const writeJson = (path: string, data: unknown) =>
    writeFileSync(join(target, path), `${JSON.stringify(data, null, 2)}\n`);
  writeJson('package.json', projectPackage(options));
  writeFileSync(
    join(target, `vite.config.${options.language}`),
    viteConfiguration(options),
  );
  if (options.language === 'ts')
    writeJson('tsconfig.json', typescriptConfiguration(options));
  writeFileSync(join(target, 'README.md'), projectReadme(options));

  for (const file of ['config/settings_schema.json', 'locales/en.default.schema.json']) {
    const path = join(target, file);
    writeFileSync(
      path,
      readFileSync(path, 'utf8').replaceAll('__THEME_NAME__', options.name),
    );
  }
  if (options.framework === 'alpine')
    rmSync(join(target, 'src', `sections.${options.language}`));
  if (options.tailwind) {
    const path = join(target, 'src/style.css');
    writeFileSync(
      path,
      `@import 'tailwindcss';\n@source '../layout';\n@source '../sections';\n@source '../snippets';\n@source '../blocks';\n@source '../templates';\n\n${readFileSync(path, 'utf8')}`,
    );
    const hero = join(target, 'sections/hero.liquid');
    writeFileSync(
      hero,
      readFileSync(hero, 'utf8').replace(
        'class="hero"',
        'class="hero rounded-xl border"',
      ),
    );
  }
}
