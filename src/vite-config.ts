import type {ConfigEnv, ResolvedConfig, UserConfig} from 'vite';
import {resolveEaselOptions} from './options.js';
import type {EaselOptions, ResolvedEaselOptions} from './types.js';
import {virtualBundleId} from './virtual.js';

export interface PreparedViteConfig {
  options: ResolvedEaselOptions;
  config: UserConfig;
}

export function prepareViteConfig(
  easelOptions: EaselOptions,
  userConfig: UserConfig,
  command: ConfigEnv['command'],
): PreparedViteConfig {
  const options = resolveEaselOptions(easelOptions, userConfig.root ?? process.cwd());

  switch (command) {
    case 'build':
      assertCompatibleBuildConfig(userConfig);
      break;
    case 'serve':
      break;
  }

  return {
    options,
    config: createViteConfig(userConfig, options, command),
  };
}

export function validateResolvedViteConfig(
  config: ResolvedConfig,
  options: ResolvedEaselOptions,
): void {
  switch (config.command) {
    case 'build':
      assertResolvedBuildConfig(config, options);
      assertNoLaterPostBuildHooks(config);
      break;
    case 'serve':
      break;
  }
}

function createViteConfig(
  config: UserConfig,
  options: ResolvedEaselOptions,
  command: ConfigEnv['command'],
): UserConfig {
  const stableCssEntryIds = new Set(
    options.bundles.map((bundle) => `easel:${bundle.name}`),
  );
  const input = Object.fromEntries(
    options.bundles.map((bundle) => [bundle.name, virtualBundleId(bundle.name)]),
  );

  return {
    ...(command === 'build' ? {base: './'} : {}),
    build: {
      outDir: options.stagingPath,
      emptyOutDir: true,
      assetsDir: '',
      manifest: true,
      rollupOptions: {
        input,
        output: {
          entryFileNames: `${options.prefix}[name].js`,
          chunkFileNames: `${options.prefix}[name]-[hash].js`,
          assetFileNames(asset) {
            const original = asset.names[0] ?? asset.name ?? 'asset';
            if (!original.endsWith('.css')) {
              return `${options.prefix}[name]-[hash][extname]`;
            }
            return isEntryStylesheet(asset.originalFileNames, stableCssEntryIds)
              ? `${options.prefix}[name].css`
              : `${options.prefix}[name]-[hash].css`;
          },
        },
      },
    },
    server: {
      ...(config.server?.cors === undefined ? {cors: shopifyCorsPolicy()} : {}),
      fs: {
        allow: easelFileSystemAllowList(config.server?.fs?.allow ?? [], options),
      },
    },
  };
}

function isEntryStylesheet(
  originalFileNames: string[],
  stableCssEntryIds: Set<string>,
): boolean {
  return originalFileNames.some((file) => {
    const normalized = file.replaceAll('\\', '/');
    return stableCssEntryIds.has(normalized.slice(normalized.lastIndexOf('/') + 1));
  });
}

function shopifyCorsPolicy(): {origin: RegExp[]} {
  return {
    origin: [
      /^https?:\/\/(?:[^.]+\.)*myshopify\.com$/,
      /^https:\/\/admin\.shopify\.com$/,
      /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/,
    ],
  };
}

function easelFileSystemAllowList(
  configured: string[],
  options: ResolvedEaselOptions,
): string[] {
  const existing = new Set(configured);
  return unique([options.projectRoot, options.sourcePath]).filter(
    (path) => !existing.has(path),
  );
}

function assertCompatibleBuildConfig(config: UserConfig): void {
  const build = config.build;
  const conflict = firstViolation([
    [
      config.base !== undefined && config.base !== './',
      'Vite base must be "./" for Shopify CDN assets',
    ],
    [
      build?.outDir !== undefined,
      'build.outDir conflicts with Easel staging; configure the Shopify theme with easel({ theme }) instead',
    ],
    [
      build?.emptyOutDir !== undefined,
      'build.emptyOutDir is managed by Easel for safe staging',
    ],
    [
      build?.assetsDir !== undefined,
      'build.assetsDir is managed by Easel for flat Shopify assets',
    ],
    [build?.manifest !== undefined, 'build.manifest is managed by Easel'],
    [build?.write === false, 'build.write must remain enabled'],
    [
      build?.rollupOptions?.input !== undefined,
      'build.rollupOptions.input conflicts with Easel bundles',
    ],
    [
      build?.rollupOptions?.output !== undefined,
      'build.rollupOptions.output is managed by Easel',
    ],
  ]);
  if (conflict !== undefined) throw new Error(`[easel] ${conflict}`);
}

function assertResolvedBuildConfig(
  config: ResolvedConfig,
  options: ResolvedEaselOptions,
): void {
  const violation = firstViolation([
    [config.base !== './', 'resolved Vite base must be "./"'],
    [
      config.build.outDir !== options.stagingPath,
      "another Vite plugin changed Easel's staging directory",
    ],
    [
      config.build.assetsDir !== '',
      "another Vite plugin changed Easel's flat asset layout",
    ],
    [
      config.build.emptyOutDir !== true,
      "another Vite plugin disabled Easel's staging cleanup",
    ],
    [
      config.build.manifest !== true,
      "another Vite plugin changed Easel's manifest setting",
    ],
    [config.build.write === false, 'build.write must remain enabled'],
  ]);
  if (violation !== undefined) throw new Error(`[easel] ${violation}`);
}

function firstViolation(
  checks: [violated: boolean, message: string][],
): string | undefined {
  return checks.find(([violated]) => violated)?.[1];
}

function assertNoLaterPostBuildHooks(config: ResolvedConfig): void {
  const easelIndex = config.plugins.findIndex(
    (plugin) => plugin.name === 'easel:shopify-theme',
  );
  const unsafe = config.plugins.slice(easelIndex + 1).filter(hasPostOutputHook);
  if (unsafe.length > 0) {
    throw new Error(
      `[easel] Easel must run after plugins with post-order output hooks: ${unsafe
        .map((plugin) => plugin.name)
        .join(', ')}. Move easel() after those plugins.`,
    );
  }
}

function hasPostOutputHook(plugin: ResolvedConfig['plugins'][number]): boolean {
  return [plugin.writeBundle, plugin.closeBundle].some(
    (hook) => typeof hook === 'object' && hook.order === 'post',
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
