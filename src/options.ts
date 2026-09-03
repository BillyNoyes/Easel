import {createHash} from 'node:crypto';
import {existsSync, statSync} from 'node:fs';
import {isAbsolute, join, relative, resolve, sep} from 'node:path';
import type {
  FrameBundle,
  FrameOptions,
  ResolvedFrameBundle,
  ResolvedFrameOptions,
} from './types.js';

const DEFAULT_SOURCE = 'src';
const DEFAULT_LIQUID = 'frame-assets.liquid';
const DEFAULT_PREFIX = 'frame-';
const DEFAULT_REFRESH_SIGNAL = '.frame/shopify-ready';
const DEFAULT_REFRESH_DELAY = 100;
const ENTRY_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LIQUID_FILENAME = /^[a-z0-9][a-z0-9_-]*\.liquid$/;

export function resolveFrameOptions(
  options: FrameOptions,
  projectRoot: string,
): ResolvedFrameOptions {
  const root = resolve(projectRoot);
  const themePath = resolveFrom(root, options.theme ?? '.');
  const sourcePath = resolveFrom(root, options.source ?? DEFAULT_SOURCE);
  const liquidFilename = options.liquid ?? DEFAULT_LIQUID;
  const prefix = options.prefix ?? DEFAULT_PREFIX;

  assertTheme(themePath);
  assertSource(sourcePath);
  assertLiquidFilename(liquidFilename);
  assertPrefix(prefix);
  const refresh = resolveRefresh(options.refresh, root);

  const bundles = resolveBundles(options.bundles, sourcePath);
  const framePath = join(root, '.frame');
  const themeId = createHash('sha256').update(themePath).digest('hex').slice(0, 16);

  return {
    projectRoot: root,
    themePath,
    sourcePath,
    stagingPath: join(framePath, 'build', themeId),
    ledgerPath: join(framePath, 'themes', themeId, 'outputs.json'),
    liquidPath: join(themePath, 'snippets', liquidFilename),
    liquidFilename,
    prefix,
    refresh,
    bundles,
  };
}

function resolveRefresh(
  configured: FrameOptions['refresh'],
  projectRoot: string,
): ResolvedFrameOptions['refresh'] {
  if (configured === false) {
    return {
      enabled: false,
      signalPath: join(projectRoot, DEFAULT_REFRESH_SIGNAL),
      delay: DEFAULT_REFRESH_DELAY,
    };
  }

  const options = configured === true || configured === undefined ? {} : configured;
  const delay = options.delay ?? DEFAULT_REFRESH_DELAY;
  if (!Number.isInteger(delay) || delay < 0 || delay > 10_000) {
    throw new Error('[frame] refresh.delay must be an integer from 0 to 10000 milliseconds');
  }

  return {
    enabled: true,
    signalPath: resolveFrom(projectRoot, options.signal ?? DEFAULT_REFRESH_SIGNAL),
    delay,
  };
}

function resolveBundles(
  configured: Record<string, FrameBundle> | undefined,
  sourcePath: string,
): ResolvedFrameBundle[] {
  const bundles = configured ?? {theme: resolveDefaultBundle(sourcePath)};
  const entries = Object.entries(bundles);

  if (entries.length === 0) {
    throw new Error('[frame] bundles must contain at least one named bundle');
  }

  return entries.map(([name, bundle]) => {
    if (!ENTRY_NAME.test(name)) {
      throw new Error(
        `[frame] invalid bundle name "${name}"; use lowercase letters, numbers, and hyphens`,
      );
    }
    if (bundle.script === undefined && bundle.style === undefined) {
      throw new Error(`[frame] bundle "${name}" needs a script, a style, or both`);
    }

    return {
      name,
      ...resolveBundleFiles(name, bundle, sourcePath),
    };
  });
}

function resolveDefaultBundle(sourcePath: string): FrameBundle {
  const typescriptEntry = join(sourcePath, 'main.ts');
  const javascriptEntry = join(sourcePath, 'main.js');
  const styleEntry = join(sourcePath, 'style.css');
  const hasTypescript = isFile(typescriptEntry);
  const hasJavascript = isFile(javascriptEntry);

  if (hasTypescript && hasJavascript) {
    throw new Error(
      '[frame] both src/main.ts and src/main.js exist; configure bundles to choose one explicitly',
    );
  }
  if (!hasTypescript && !hasJavascript) {
    throw new Error(
      '[frame] expected src/main.ts or src/main.js; configure source or bundles for a different layout',
    );
  }
  if (!isFile(styleEntry)) {
    throw new Error(
      '[frame] expected src/style.css; configure bundles explicitly to build without a stylesheet',
    );
  }

  return {
    script: hasTypescript ? typescriptEntry : javascriptEntry,
    style: styleEntry,
  };
}

function resolveBundleFiles(
  name: string,
  bundle: FrameBundle,
  sourcePath: string,
): Omit<ResolvedFrameBundle, 'name'> {
  const resolved: Omit<ResolvedFrameBundle, 'name'> = {};

  if (bundle.script !== undefined) {
    resolved.script = resolveInput(name, 'script', bundle.script, sourcePath);
  }
  if (bundle.style !== undefined) {
    resolved.style = resolveInput(name, 'style', bundle.style, sourcePath);
  }

  return resolved;
}

function resolveInput(
  bundleName: string,
  kind: 'script' | 'style',
  input: string,
  sourcePath: string,
): string {
  const path = resolveFrom(sourcePath, input);
  if (!isFile(path)) {
    throw new Error(`[frame] ${kind} for bundle "${bundleName}" does not exist: ${path}`);
  }
  return path;
}

function assertTheme(themePath: string): void {
  for (const directory of ['assets', 'layout', 'snippets']) {
    const path = join(themePath, directory);
    if (!existsSync(path) || !statSync(path).isDirectory()) {
      throw new Error(`[frame] invalid Shopify theme at ${themePath}: missing ${directory}/`);
    }
  }
}

function assertSource(sourcePath: string): void {
  if (!existsSync(sourcePath) || !statSync(sourcePath).isDirectory()) {
    throw new Error(`[frame] source directory does not exist: ${sourcePath}`);
  }
}

function assertLiquidFilename(filename: string): void {
  if (!LIQUID_FILENAME.test(filename)) {
    throw new Error(
      `[frame] liquid must be a filename such as "frame-assets.liquid", received "${filename}"`,
    );
  }
}

function assertPrefix(prefix: string): void {
  if (!/^[a-z0-9][a-z0-9-]*-$/.test(prefix)) {
    throw new Error(
      `[frame] prefix must use lowercase letters, numbers, and hyphens and end in a hyphen`,
    );
  }
}

function resolveFrom(base: string, path: string): string {
  return isAbsolute(path) ? resolve(path) : resolve(base, path);
}

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

export function projectRelative(path: string, projectRoot: string): string {
  const value = relative(projectRoot, path);
  return value.split(sep).join('/');
}
