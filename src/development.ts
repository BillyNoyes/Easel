import type {ViteDevServer} from 'vite';
import {renderDevelopmentLiquid} from './liquid.js';
import {projectRelative} from './options.js';
import {assertDevelopmentLiquidWritable, writeDevelopmentLiquid} from './output.js';
import {watchRefreshSignal} from './refresh.js';
import type {ResolvedEaselOptions} from './types.js';

export function configureDevelopmentServer(
  server: ViteDevServer,
  options: ResolvedEaselOptions,
): void {
  if (server.httpServer === null) {
    throw new Error(
      '[easel] Vite middleware mode is not supported; Easel requires the development server lifecycle',
    );
  }

  assertDevelopmentLiquidWritable(options);
  const stopWatching = configureRefresh(server, options);
  let restoreDevelopmentLiquid: (() => void) | undefined;

  server.httpServer.once('listening', () => {
    restoreDevelopmentLiquid = writeDevelopmentLiquid(
      options,
      renderDevelopmentLiquid(
        options.bundles.map((bundle) => bundle.name),
        developmentOrigin(server),
      ),
    );
  });
  server.httpServer.once('close', () => {
    stopWatching?.();
    restoreDevelopmentLiquid?.();
  });
}

function configureRefresh(
  server: ViteDevServer,
  options: ResolvedEaselOptions,
): (() => void) | undefined {
  if (!options.refresh.enabled) return undefined;

  const stopWatching = watchRefreshSignal(
    options.refresh.signalPath,
    options.refresh.delay,
    () => server.ws.send({type: 'full-reload', path: '*'}),
  );
  server.config.logger.info(
    `[easel] Shopify refresh signal: ${projectRelative(
      options.refresh.signalPath,
      options.projectRoot,
    )}`,
  );
  return stopWatching;
}

function developmentOrigin(server: ViteDevServer): string {
  const origin =
    server.config.server.origin ??
    server.resolvedUrls?.local[0] ??
    server.resolvedUrls?.network[0];
  if (origin === undefined) {
    throw new Error(
      '[easel] Vite did not expose a development URL; set server.origin explicitly',
    );
  }
  return origin;
}
