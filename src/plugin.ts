import type {Plugin, ResolvedConfig} from 'vite';
import {finalizeProductionBuild} from './build.js';
import {configureDevelopmentServer} from './development.js';
import type {FrameOptions, ResolvedFrameOptions} from './types.js';
import {frameBundleModules} from './virtual.js';
import {prepareViteConfig, validateResolvedViteConfig} from './vite-config.js';

interface BuildLifecycle {
  failed: boolean;
  outputHooksCompleted: boolean;
}

export function frame(options: FrameOptions = {}): Plugin[] {
  let resolvedOptions: ResolvedFrameOptions | undefined;
  let resolvedConfig: ResolvedConfig | undefined;
  const build: BuildLifecycle = {
    failed: false,
    outputHooksCompleted: false,
  };

  const requireOptions = (): ResolvedFrameOptions => {
    if (resolvedOptions === undefined) {
      throw new Error('[frame] plugin options have not been resolved');
    }
    return resolvedOptions;
  };

  const integration: Plugin = {
    name: 'frame:shopify-theme',
    enforce: 'post',
    config(config, environment) {
      const prepared = prepareViteConfig(options, config, environment.command);
      resolvedOptions = prepared.options;
      return prepared.config;
    },
    configResolved(config) {
      resolvedConfig = config;
      validateResolvedViteConfig(config, requireOptions());
    },
    configureServer(server) {
      configureDevelopmentServer(server, requireOptions());
    },
    buildStart() {
      build.failed = false;
      build.outputHooksCompleted = false;
    },
    buildEnd(error) {
      if (error !== undefined) build.failed = true;
    },
    writeBundle: {
      order: 'post',
      sequential: true,
      handler() {
        build.outputHooksCompleted = true;
      },
    },
    closeBundle: {
      order: 'post',
      sequential: true,
      handler() {
        const config = resolvedConfig;
        if (config?.command !== 'build') return;
        finalizeProductionBuild(
          requireOptions(),
          config,
          !build.failed && build.outputHooksCompleted,
        );
      },
    },
  };

  return [frameBundleModules(() => requireOptions().bundles), integration];
}
