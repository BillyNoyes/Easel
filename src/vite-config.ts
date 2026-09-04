import type {ConfigEnv, ResolvedConfig, UserConfig} from 'vite';
import {resolveFrameOptions} from './options.js';
import type {FrameOptions, ResolvedFrameOptions} from './types.js';
import {virtualBundleId} from './virtual.js';

export interface PreparedViteConfig {
  options: ResolvedFrameOptions;
  config: UserConfig;
}

export function prepareViteConfig(
  frameOptions: FrameOptions,
  userConfig: UserConfig,
  command: ConfigEnv['command'],
): PreparedViteConfig {
  const options = resolveFrameOptions(frameOptions, userConfig.root ?? process.cwd());

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
  options: ResolvedFrameOptions,
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
  options: ResolvedFrameOptions,
  command: ConfigEnv['command'],
): UserConfig {
  const stableCssEntryIds = new Set(
    options.bundles.map((bundle) => `frame:${bundle.name}`),
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
      cors: config.server?.cors ?? shopifyCorsPolicy(),
      fs: {
        allow: unique([
          ...(config.server?.fs?.allow ?? []),
          options.projectRoot,
          options.sourcePath,
        ]),
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

function assertCompatibleBuildConfig(config: UserConfig): void {
  const build = config.build;
  const conflict = firstViolation([
    [
      config.base !== undefined && config.base !== './',
      'Vite base must be "./" for Shopify CDN assets',
    ],
    [
      build?.outDir !== undefined,
      'build.outDir conflicts with Frame staging; configure the Shopify theme with frame({ theme }) instead',
    ],
    [
      build?.emptyOutDir !== undefined,
      'build.emptyOutDir is managed by Frame for safe staging',
    ],
    [
      build?.assetsDir !== undefined,
      'build.assetsDir is managed by Frame for flat Shopify assets',
    ],
    [build?.manifest !== undefined, 'build.manifest is managed by Frame'],
    [build?.write === false, 'build.write must remain enabled'],
    [
      build?.rollupOptions?.input !== undefined,
      'build.rollupOptions.input conflicts with Frame bundles',
    ],
    [
      build?.rollupOptions?.output !== undefined,
      'build.rollupOptions.output is managed by Frame',
    ],
  ]);
  if (conflict !== undefined) throw new Error(`[frame] ${conflict}`);
}

function assertResolvedBuildConfig(
  config: ResolvedConfig,
  options: ResolvedFrameOptions,
): void {
  const violation = firstViolation([
    [config.base !== './', 'resolved Vite base must be "./"'],
    [
      config.build.outDir !== options.stagingPath,
      "another Vite plugin changed Frame's staging directory",
    ],
    [
      config.build.assetsDir !== '',
      "another Vite plugin changed Frame's flat asset layout",
    ],
    [
      config.build.emptyOutDir !== true,
      "another Vite plugin disabled Frame's staging cleanup",
    ],
    [
      config.build.manifest !== true,
      "another Vite plugin changed Frame's manifest setting",
    ],
    [config.build.write === false, 'build.write must remain enabled'],
  ]);
  if (violation !== undefined) throw new Error(`[frame] ${violation}`);
}

function firstViolation(
  checks: [violated: boolean, message: string][],
): string | undefined {
  return checks.find(([violated]) => violated)?.[1];
}

function assertNoLaterPostBuildHooks(config: ResolvedConfig): void {
  const frameIndex = config.plugins.findIndex(
    (plugin) => plugin.name === 'frame:shopify-theme',
  );
  const unsafe = config.plugins.slice(frameIndex + 1).filter((plugin) =>
    ['writeBundle', 'closeBundle'].some((hookName) => {
      const hook = plugin[hookName as 'writeBundle' | 'closeBundle'];
      return typeof hook === 'object' && hook.order === 'post';
    }),
  );
  if (unsafe.length > 0) {
    throw new Error(
      `[frame] Frame must run after plugins with post-order output hooks: ${unsafe
        .map((plugin) => plugin.name)
        .join(', ')}. Move frame() after those plugins.`,
    );
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
