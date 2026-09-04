import {createHash, randomUUID} from 'node:crypto';
import {existsSync, lstatSync, realpathSync, statSync} from 'node:fs';
import {isAbsolute, join, relative, resolve, sep} from 'node:path';
import type {
  FrameBundle,
  FrameOptions,
  ResolvedFrameBundle,
  ResolvedFrameOptions,
} from './types.js';

const DEFAULT_SOURCE = 'src';
const DEFAULT_NAMESPACE = 'frame';
const DEFAULT_REFRESH_SIGNAL = '.frame/shopify-ready';
const DEFAULT_REFRESH_DELAY = 100;
const ENTRY_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function resolveFrameOptions(
  options: FrameOptions,
  projectRoot: string,
): ResolvedFrameOptions {
  const root = realpathSync(resolve(projectRoot));
  const configuredThemePath = resolveFrom(root, options.theme ?? '.');
  assertTheme(configuredThemePath);
  const themePath = realpathSync(configuredThemePath);
  const configuredSourcePath = resolveFrom(root, options.source ?? DEFAULT_SOURCE);
  const namespace = options.namespace ?? DEFAULT_NAMESPACE;

  assertSource(configuredSourcePath);
  const sourcePath = realpathSync(configuredSourcePath);
  assertNamespace(namespace);
  const liquidFilename = `${namespace}-assets.liquid`;
  const prefix = `${namespace}-`;
  const refresh = resolveRefresh(options.refresh, root);

  const bundles = resolveBundles(options.bundles, sourcePath);
  const framePath = join(root, '.frame');
  const themeId = createHash('sha256').update(themePath).digest('hex').slice(0, 16);
  const stagingParent = join(framePath, 'build', themeId);
  const stagingPath = join(stagingParent, randomUUID());
  const themeStatePath = join(framePath, 'themes', themeId);
  const ledgerPath = join(themeStatePath, 'outputs.json');
  assertFrameStatePaths([
    framePath,
    join(framePath, 'build'),
    stagingParent,
    join(framePath, 'themes'),
    themeStatePath,
  ]);

  return {
    projectRoot: root,
    themePath,
    sourcePath,
    stagingPath,
    ledgerPath,
    commitLockPath: join(themeStatePath, 'commit.lock'),
    manifestPath: join(themeStatePath, 'manifest.json'),
    productionLiquidPath: join(themeStatePath, 'production.txt'),
    transactionPath: join(themeStatePath, 'transaction'),
    liquidPath: join(themePath, 'snippets', liquidFilename),
    liquidFilename,
    namespace,
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
    throw new Error(
      '[frame] refresh.delay must be an integer from 0 to 10000 milliseconds',
    );
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

  const resolved = entries.map(([name, bundle]) => {
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

  const scriptOwners = new Map<string, string>();
  for (const bundle of resolved) {
    if (bundle.script === undefined) continue;
    const owner = scriptOwners.get(bundle.script);
    if (owner !== undefined) {
      throw new Error(
        `[frame] bundles "${owner}" and "${bundle.name}" use the same script; each named bundle needs a distinct script entry`,
      );
    }
    scriptOwners.set(bundle.script, bundle.name);
  }

  return resolved;
}

function resolveDefaultBundle(sourcePath: string): FrameBundle {
  const typescriptEntry = join(sourcePath, 'main.ts');
  const javascriptEntry = join(sourcePath, 'main.js');
  const styleEntry = join(sourcePath, 'style.css');
  const hasTypescript = isFile(typescriptEntry);
  const hasJavascript = isFile(javascriptEntry);

  if (hasTypescript && hasJavascript) {
    throw new Error(
      `[frame] both main.ts and main.js exist in ${sourcePath}; configure bundles to choose one explicitly`,
    );
  }
  if (!hasTypescript && !hasJavascript) {
    throw new Error(
      `[frame] expected main.ts or main.js in ${sourcePath}; configure source or bundles for a different layout`,
    );
  }
  if (!isFile(styleEntry)) {
    throw new Error(
      `[frame] expected style.css in ${sourcePath}; configure bundles explicitly to build without a stylesheet`,
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
  return realpathSync(path);
}

function assertTheme(themePath: string): void {
  for (const directory of ['assets', 'layout', 'snippets']) {
    const path = join(themePath, directory);
    if (!existsSync(path) || !statSync(path).isDirectory()) {
      throw new Error(
        `[frame] invalid Shopify theme at ${themePath}: missing ${directory}/`,
      );
    }
    if (lstatSync(path).isSymbolicLink()) {
      throw new Error(
        `[frame] Shopify theme output directory cannot be a symbolic link: ${path}`,
      );
    }
  }
}

function assertFrameStatePaths(paths: string[]): void {
  for (const path of paths) {
    if (!existsSync(path)) continue;
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error(`[frame] state directory must be a real directory: ${path}`);
    }
  }
}

function assertSource(sourcePath: string): void {
  if (!existsSync(sourcePath) || !statSync(sourcePath).isDirectory()) {
    throw new Error(`[frame] source directory does not exist: ${sourcePath}`);
  }
}

function assertNamespace(namespace: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(namespace)) {
    throw new Error(
      '[frame] namespace must use lowercase letters, numbers, and single hyphens',
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
