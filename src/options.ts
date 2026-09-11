import {createHash, randomUUID} from 'node:crypto';
import {existsSync, lstatSync, realpathSync, statSync} from 'node:fs';
import {isAbsolute, join, relative, resolve, sep} from 'node:path';
import type {
  EaselBundle,
  EaselOptions,
  ResolvedEaselBundle,
  ResolvedEaselOptions,
} from './types.js';
import {SAFE_OUTPUT_NAME} from './validation.js';

const DEFAULT_SOURCE = 'src';
const DEFAULT_NAMESPACE = 'easel';
const DEFAULT_REFRESH_SIGNAL = '.easel/shopify-ready';
const DEFAULT_REFRESH_DELAY = 100;

type EaselStatePaths = Pick<
  ResolvedEaselOptions,
  | 'stagingPath'
  | 'ledgerPath'
  | 'commitLockPath'
  | 'manifestPath'
  | 'productionLiquidPath'
  | 'transactionPath'
>;

export function resolveEaselOptions(
  options: EaselOptions,
  projectRoot: string,
): ResolvedEaselOptions {
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
  const statePaths = resolveEaselStatePaths(root, themePath);

  return {
    projectRoot: root,
    themePath,
    sourcePath,
    ...statePaths,
    liquidPath: join(themePath, 'snippets', liquidFilename),
    liquidFilename,
    namespace,
    prefix,
    refresh,
    bundles,
  };
}

function resolveRefresh(
  configured: EaselOptions['refresh'],
  projectRoot: string,
): ResolvedEaselOptions['refresh'] {
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
      '[easel] refresh.delay must be an integer from 0 to 10000 milliseconds',
    );
  }

  return {
    enabled: true,
    signalPath: resolveFrom(projectRoot, options.signal ?? DEFAULT_REFRESH_SIGNAL),
    delay,
  };
}

function resolveBundles(
  configured: Record<string, EaselBundle> | undefined,
  sourcePath: string,
): ResolvedEaselBundle[] {
  const bundles = configured ?? {theme: resolveDefaultBundle(sourcePath)};
  const entries = Object.entries(bundles);

  if (entries.length === 0) {
    throw new Error('[easel] bundles must contain at least one named bundle');
  }

  const resolved = entries.map(([name, bundle]) => {
    if (!SAFE_OUTPUT_NAME.test(name)) {
      throw new Error(
        `[easel] invalid bundle name "${name}"; use lowercase letters, numbers, and hyphens`,
      );
    }
    if (bundle.script === undefined && bundle.style === undefined) {
      throw new Error(`[easel] bundle "${name}" needs a script, a style, or both`);
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
        `[easel] bundles "${owner}" and "${bundle.name}" use the same script; each named bundle needs a distinct script entry`,
      );
    }
    scriptOwners.set(bundle.script, bundle.name);
  }

  return resolved;
}

function resolveDefaultBundle(sourcePath: string): EaselBundle {
  const typescriptEntry = join(sourcePath, 'main.ts');
  const javascriptEntry = join(sourcePath, 'main.js');
  const styleEntry = join(sourcePath, 'style.css');
  const hasTypescript = isFile(typescriptEntry);
  const hasJavascript = isFile(javascriptEntry);

  if (hasTypescript && hasJavascript) {
    throw new Error(
      `[easel] both main.ts and main.js exist in ${sourcePath}; configure bundles to choose one explicitly`,
    );
  }
  if (!hasTypescript && !hasJavascript) {
    throw new Error(
      `[easel] expected main.ts or main.js in ${sourcePath}; configure source or bundles for a different layout`,
    );
  }
  if (!isFile(styleEntry)) {
    throw new Error(
      `[easel] expected style.css in ${sourcePath}; configure bundles explicitly to build without a stylesheet`,
    );
  }

  return {
    script: hasTypescript ? typescriptEntry : javascriptEntry,
    style: styleEntry,
  };
}

function resolveBundleFiles(
  name: string,
  bundle: EaselBundle,
  sourcePath: string,
): Omit<ResolvedEaselBundle, 'name'> {
  const resolved: Omit<ResolvedEaselBundle, 'name'> = {};

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
    throw new Error(`[easel] ${kind} for bundle "${bundleName}" does not exist: ${path}`);
  }
  return realpathSync(path);
}

function resolveEaselStatePaths(projectRoot: string, themePath: string): EaselStatePaths {
  const easelPath = join(projectRoot, '.easel');
  const themeId = createHash('sha256').update(themePath).digest('hex').slice(0, 16);
  const stagingParent = join(easelPath, 'build', themeId);
  const themeStatePath = join(easelPath, 'themes', themeId);
  assertEaselStatePaths([
    easelPath,
    join(easelPath, 'build'),
    stagingParent,
    join(easelPath, 'themes'),
    themeStatePath,
  ]);

  return {
    stagingPath: join(stagingParent, randomUUID()),
    ledgerPath: join(themeStatePath, 'outputs.json'),
    commitLockPath: join(themeStatePath, 'commit.lock'),
    manifestPath: join(themeStatePath, 'manifest.json'),
    productionLiquidPath: join(themeStatePath, 'production.txt'),
    transactionPath: join(themeStatePath, 'transaction'),
  };
}

function assertTheme(themePath: string): void {
  for (const directory of ['assets', 'layout', 'snippets']) {
    const path = join(themePath, directory);
    const metadata = lstatSync(path, {throwIfNoEntry: false});
    if (metadata?.isSymbolicLink()) {
      throw new Error(
        `[easel] Shopify theme output directory cannot be a symbolic link: ${path}`,
      );
    }
    if (metadata === undefined || !metadata.isDirectory()) {
      throw new Error(
        `[easel] invalid Shopify theme at ${themePath}: missing ${directory}/`,
      );
    }
  }
}

function assertEaselStatePaths(paths: string[]): void {
  for (const path of paths) {
    const metadata = lstatSync(path, {throwIfNoEntry: false});
    if (metadata === undefined) continue;
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error(`[easel] state directory must be a real directory: ${path}`);
    }
  }
}

function assertSource(sourcePath: string): void {
  if (!existsSync(sourcePath) || !statSync(sourcePath).isDirectory()) {
    throw new Error(`[easel] source directory does not exist: ${sourcePath}`);
  }
}

function assertNamespace(namespace: string): void {
  if (!SAFE_OUTPUT_NAME.test(namespace)) {
    throw new Error(
      '[easel] namespace must use lowercase letters, numbers, and single hyphens',
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
