import {existsSync, readFileSync, readdirSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import type {Manifest, Plugin, ResolvedConfig, UserConfig} from 'vite';
import {createFrameManifest} from './manifest.js';
import {renderDevelopmentLiquid, renderProductionLiquid} from './liquid.js';
import {projectRelative, resolveFrameOptions} from './options.js';
import {
  assertDevelopmentLiquidWritable,
  commitProductionOutput,
  writeDevelopmentLiquid,
} from './output.js';
import {watchRefreshSignal} from './refresh.js';
import type {FrameOptions, ResolvedFrameOptions} from './types.js';
import {frameBundleModules, virtualBundleId} from './virtual.js';

export function frame(options: FrameOptions = {}): Plugin[] {
  let resolved: ResolvedFrameOptions | undefined;
  let viteConfig: ResolvedConfig | undefined;
  let buildFailed = false;
  let outputHooksCompleted = false;

  const requireOptions = (): ResolvedFrameOptions => {
    if (resolved === undefined) {
      throw new Error('[frame] plugin options have not been resolved');
    }
    return resolved;
  };

  const integration: Plugin = {
    name: 'frame:shopify-theme',
    enforce: 'post',
    config(config, environment): UserConfig {
      const projectRoot = config.root ?? process.cwd();
      resolved = resolveFrameOptions(options, projectRoot);

      if (environment.command === 'build') {
        assertCompatibleBuildConfig(config);
      }

      const frameOptions = resolved;
      const stableCssEntryIds = new Set(
        frameOptions.bundles.map((bundle) => `frame:${bundle.name}`),
      );
      const input = Object.fromEntries(
        frameOptions.bundles.map((bundle) => [bundle.name, virtualBundleId(bundle.name)]),
      );

      return {
        ...(environment.command === 'build' ? {base: './'} : {}),
        build: {
          outDir: frameOptions.stagingPath,
          emptyOutDir: true,
          assetsDir: '',
          manifest: true,
          rollupOptions: {
            input,
            output: {
              entryFileNames: `${frameOptions.prefix}[name].js`,
              chunkFileNames: `${frameOptions.prefix}[name]-[hash].js`,
              assetFileNames(asset) {
                const original = asset.names[0] ?? asset.name ?? 'asset';
                if (original.endsWith('.css')) {
                  const isEntryCss = asset.originalFileNames.some((file) => {
                    const normalized = file.replaceAll('\\', '/');
                    return stableCssEntryIds.has(
                      normalized.slice(normalized.lastIndexOf('/') + 1),
                    );
                  });
                  return isEntryCss
                    ? `${frameOptions.prefix}[name].css`
                    : `${frameOptions.prefix}[name]-[hash].css`;
                }
                return `${frameOptions.prefix}[name]-[hash][extname]`;
              },
            },
          },
        },
        server: {
          cors: config.server?.cors ?? {
            origin: [
              /^https?:\/\/(?:[^.]+\.)*myshopify\.com$/,
              /^https:\/\/admin\.shopify\.com$/,
              /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/,
            ],
          },
          fs: {
            allow: unique([
              ...(config.server?.fs?.allow ?? []),
              frameOptions.projectRoot,
              frameOptions.sourcePath,
            ]),
          },
        },
      };
    },
    configResolved(config) {
      viteConfig = config;
      if (config.command === 'build') {
        assertResolvedBuildConfig(config, requireOptions());
        assertNoLaterPostBuildHooks(config);
      }
    },
    buildStart() {
      buildFailed = false;
      outputHooksCompleted = false;
    },
    buildEnd(error) {
      if (error !== undefined) buildFailed = true;
    },
    writeBundle: {
      order: 'post',
      sequential: true,
      handler() {
        outputHooksCompleted = true;
      },
    },
    configureServer(server) {
      const frameOptions = requireOptions();
      assertDevelopmentLiquidWritable(frameOptions);
      let restoreDevelopmentLiquid: (() => void) | undefined;

      if (frameOptions.refresh.enabled) {
        const stopWatching = watchRefreshSignal(
          frameOptions.refresh.signalPath,
          frameOptions.refresh.delay,
          () => server.ws.send({type: 'full-reload', path: '*'}),
        );
        server.httpServer?.once('close', stopWatching);
        server.config.logger.info(
          `[frame] Shopify refresh signal: ${projectRelative(
            frameOptions.refresh.signalPath,
            frameOptions.projectRoot,
          )}`,
        );
      }

      server.httpServer?.once('listening', () => {
        const configuredOrigin = server.config.server.origin;
        const origin =
          configuredOrigin ??
          server.resolvedUrls?.local[0] ??
          server.resolvedUrls?.network[0];

        if (origin === undefined) {
          throw new Error(
            '[frame] Vite did not expose a development URL; set server.origin explicitly',
          );
        }

        restoreDevelopmentLiquid = writeDevelopmentLiquid(
          frameOptions,
          renderDevelopmentLiquid(
            frameOptions.bundles.map((bundle) => bundle.name),
            origin,
          ),
        );
      });
      server.httpServer?.once('close', () => restoreDevelopmentLiquid?.());
    },
    closeBundle: {
      order: 'post',
      sequential: true,
      handler() {
        if (viteConfig?.command !== 'build') return;
        const frameOptions = requireOptions();
        try {
          if (buildFailed || !outputHooksCompleted) return;
          const manifestPath = join(frameOptions.stagingPath, '.vite', 'manifest.json');
          if (!existsSync(manifestPath)) {
            throw new Error(
              `[frame] Vite did not write its build manifest: ${manifestPath}`,
            );
          }
          const viteManifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
          const manifest = createFrameManifest(
            viteManifest,
            frameOptions.bundles,
            listEmittedFiles(frameOptions.stagingPath),
          );
          const liquid = renderProductionLiquid(manifest);
          commitProductionOutput(frameOptions, manifest, liquid);
        } finally {
          try {
            rmSync(frameOptions.stagingPath, {recursive: true, force: true});
          } catch (error) {
            viteConfig.logger.warn(
              `[frame] could not remove staging directory ${frameOptions.stagingPath}: ${errorMessage(error)}`,
            );
          }
        }
      },
    },
  };

  return [frameBundleModules(() => requireOptions().bundles), integration];
}

function listEmittedFiles(stagingPath: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(stagingPath, {withFileTypes: true})) {
    if (entry.name === '.vite' && entry.isDirectory()) continue;
    if (!entry.isFile()) {
      throw new Error(`[frame] unexpected output in staging directory: ${entry.name}`);
    }
    files.push(entry.name);
  }
  return files;
}

function assertCompatibleBuildConfig(config: UserConfig): void {
  const build = config.build;
  if (config.base !== undefined && config.base !== './') {
    throw new Error('[frame] Vite base must be "./" for Shopify CDN assets');
  }
  if (build?.outDir !== undefined) {
    throw new Error(
      '[frame] build.outDir conflicts with Frame staging; configure the Shopify theme with frame({ theme }) instead',
    );
  }
  if (build?.emptyOutDir !== undefined) {
    throw new Error('[frame] build.emptyOutDir is managed by Frame for safe staging');
  }
  if (build?.assetsDir !== undefined) {
    throw new Error(
      '[frame] build.assetsDir is managed by Frame for flat Shopify assets',
    );
  }
  if (build?.manifest !== undefined) {
    throw new Error('[frame] build.manifest is managed by Frame');
  }
  if (build?.write === false) {
    throw new Error('[frame] build.write must remain enabled');
  }
  if (build?.rollupOptions?.input !== undefined) {
    throw new Error('[frame] build.rollupOptions.input conflicts with Frame bundles');
  }
  if (build?.rollupOptions?.output !== undefined) {
    throw new Error('[frame] build.rollupOptions.output is managed by Frame');
  }
}

function assertResolvedBuildConfig(
  config: ResolvedConfig,
  options: ResolvedFrameOptions,
): void {
  if (config.base !== './') {
    throw new Error('[frame] resolved Vite base must be "./"');
  }
  if (config.build.outDir !== options.stagingPath) {
    throw new Error("[frame] another Vite plugin changed Frame's staging directory");
  }
  if (config.build.assetsDir !== '') {
    throw new Error("[frame] another Vite plugin changed Frame's flat asset layout");
  }
  if (config.build.emptyOutDir !== true) {
    throw new Error("[frame] another Vite plugin disabled Frame's staging cleanup");
  }
  if (config.build.manifest !== true) {
    throw new Error("[frame] another Vite plugin changed Frame's manifest setting");
  }
  if (config.build.write === false) {
    throw new Error('[frame] build.write must remain enabled');
  }
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
