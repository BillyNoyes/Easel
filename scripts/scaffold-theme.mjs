#!/usr/bin/env node

import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {dirname, isAbsolute, relative, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));
const TEMPLATE_ROOT = fileURLToPath(new URL('../scaffolds/theme/', import.meta.url));
const SHOPIFY_DIRECTORIES = [
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

export function scaffoldTheme(target, options = {}) {
  const targetPath = resolve(target);
  const packageName = packageNameFor(targetPath);
  const themeName = options.name ?? displayNameFor(packageName);
  if (!/^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(themeName)) {
    throw new Error(
      '[easel] scaffold name must use letters, numbers, spaces, underscores, or hyphens',
    );
  }

  mkdirSync(dirname(targetPath), {recursive: true});
  try {
    mkdirSync(targetPath);
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      throw new Error(`[easel] scaffold target already exists: ${targetPath}`);
    }
    throw error;
  }

  try {
    cpSync(TEMPLATE_ROOT, targetPath, {recursive: true});
    for (const directory of SHOPIFY_DIRECTORIES) {
      mkdirSync(resolve(targetPath, directory), {recursive: true});
    }
    replaceTemplateTokens(targetPath, {
      EASEL_IMPORT: modulePath(targetPath, resolve(REPOSITORY_ROOT, 'src/index.js')),
      PACKAGE_NAME: packageName,
      THEME_NAME: themeName,
    });
  } catch (error) {
    rmSync(targetPath, {recursive: true, force: true});
    throw error;
  }

  return targetPath;
}

function replaceTemplateTokens(root, replacements) {
  for (const entry of readdirSync(root, {withFileTypes: true})) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      replaceTemplateTokens(path, replacements);
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`[easel] unsupported scaffold template entry: ${path}`);
    }

    const content = readFileSync(path, 'utf8').replace(
      /__(EASEL_IMPORT|PACKAGE_NAME|THEME_NAME)__/g,
      (_, token) => replacements[token],
    );
    writeFileSync(path, content);
  }
}

function packageNameFor(targetPath) {
  const basename = targetPath.split(sep).at(-1) ?? 'theme';
  const slug = basename
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `easel-example-${slug || 'theme'}`;
}

function displayNameFor(packageName) {
  return packageName
    .replace(/^easel-example-/, '')
    .split('-')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function modulePath(fromDirectory, moduleFile) {
  const path = relative(fromDirectory, moduleFile);
  if (isAbsolute(path)) return pathToFileURL(moduleFile).href;
  const normalized = path.split(sep).join('/');
  return normalized.startsWith('.') ? normalized : `./${normalized}`;
}

function isAlreadyExistsError(error) {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST';
}

function parseArguments(arguments_) {
  if (arguments_.includes('--help') || arguments_.includes('-h')) {
    return {help: true};
  }

  let target;
  let name;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--name') {
      name = arguments_[index + 1];
      if (name === undefined) throw new Error('[easel] --name requires a value');
      index += 1;
    } else if (argument?.startsWith('-')) {
      throw new Error(`[easel] unknown scaffold option: ${argument}`);
    } else if (target === undefined) {
      target = argument;
    } else {
      throw new Error(`[easel] unexpected scaffold argument: ${argument}`);
    }
  }

  if (target === undefined) {
    throw new Error('[easel] scaffold target is required');
  }
  return {help: false, target, name};
}

function printUsage() {
  console.log(`Usage: pnpm scaffold:theme <target> [--name "Theme Name"]

Creates a framework-neutral Shopify theme and Easel/Vite source entry points.
The target must not already exist.`);
}

const invokedPath = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href;
if (invokedPath === import.meta.url) {
  try {
    const arguments_ = parseArguments(process.argv.slice(2));
    if (arguments_.help) {
      printUsage();
    } else {
      const targetPath = scaffoldTheme(arguments_.target, {name: arguments_.name});
      console.log(`[easel] scaffolded Shopify theme at ${targetPath}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
