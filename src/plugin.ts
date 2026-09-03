import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import type {Manifest, Plugin, ResolvedConfig, UserConfig} from 'vite';
import {createFrameManifest} from './manifest.js';
import {renderDevelopmentLiquid, renderProductionLiquid} from './liquid.js';
import {projectRelative, resolveFrameOptions} from './options.js';
import {commitProductionOutput, writeDevelopmentLiquid} from './output.js';
import {watchRefreshSignal} from './refresh.js';
import type {FrameOptions, ResolvedFrameOptions} from './types.js';
import {frameVirtualBundles, virtualBundleId} from './virtual.js';

export function frame(options: FrameOptions = {}): Plugin[] {
  let resolved: ResolvedFrameOptions | undefined;
  let viteConfig: ResolvedConfig | undefined;
  let buildFailed = false;

  const requireOptions = (): ResolvedFrameOptions => {
    if (resolved === undefined) {
      throw new Error('[frame] plugin options have not been resolved');
    }
    return resolved;
  };

  const integration: Plugin = {
    name: 'frame:shopify-theme',
    enforce: 'pre',
    config(config, environment): UserConfig {
      const projectRoot = config.root ?? process.cwd();
      resolved = resolveFrameOptions(options, projectRoot);

      if (environment.command === 'build') {
        assertCompatibleBuildConfig(config);
      }

      const frameOptions = resolved;
      const input = Object.fromEntries(
        frameOptions.bundles.map((bundle) => [
          bundle.name,
          virtualBundleId(bundle.name),
        ]),
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
                return original.endsWith('.css')
                  ? `${frameOptions.prefix}[name].css`
                  : `${frameOptions.prefix}[name]-[hash][extname]`;
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
    },
    buildStart() {
      buildFailed = false;
    },
    buildEnd(error) {
      if (error !== undefined) buildFailed = true;
    },
    configureServer(server) {
      const frameOptions = requireOptions();
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

        writeDevelopmentLiquid(
          frameOptions,
          renderDevelopmentLiquid(
            frameOptions.bundles.map((bundle) => bundle.name),
            origin,
          ),
        );
      });
    },
    closeBundle() {
      if (viteConfig?.command !== 'build' || buildFailed) return;
      const frameOptions = requireOptions();
      const manifestPath = join(frameOptions.stagingPath, '.vite', 'manifest.json');
      if (!existsSync(manifestPath)) {
        throw new Error(`[frame] Vite did not write its build manifest: ${manifestPath}`);
      }
      const viteManifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
      const manifest = createFrameManifest(viteManifest, frameOptions.bundles);
      const liquid = renderProductionLiquid(manifest);

      commitProductionOutput(frameOptions, manifest, liquid);
      writeFileSync(
        join(frameOptions.stagingPath, 'frame-manifest.json'),
        `${JSON.stringify(manifest, null, 2)}\n`,
      );
    },
  };

  return [
    integration,
    frameVirtualBundles(() => requireOptions().bundles),
  ];
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
    throw new Error('[frame] build.assetsDir is managed by Frame for flat Shopify assets');
  }
  if (build?.manifest !== undefined) {
    throw new Error('[frame] build.manifest is managed by Frame');
  }
  if (build?.rollupOptions?.input !== undefined) {
    throw new Error('[frame] build.rollupOptions.input conflicts with Frame bundles');
  }
  if (build?.rollupOptions?.output !== undefined) {
    throw new Error('[frame] build.rollupOptions.output is managed by Frame');
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
