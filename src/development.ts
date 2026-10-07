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
  let detachTerminationHandlers: (() => void) | undefined;

  server.httpServer.once('listening', () => {
    restoreDevelopmentLiquid = writeDevelopmentLiquid(
      options,
      renderDevelopmentLiquid(
        options.bundles.map((bundle) => bundle.name),
        developmentOrigin(server),
      ),
    );
    detachTerminationHandlers = restoreOnTermination(restoreDevelopmentLiquid);
  });
  server.httpServer.once('close', () => {
    stopWatching?.();
    detachTerminationHandlers?.();
    restoreDevelopmentLiquid?.();
  });
}

/*
 * Vite closes the server on SIGTERM, which runs the `close` handler above.
 * SIGINT (Ctrl+C) and SIGHUP (closed terminal) keep Node's default behavior
 * and end the process without closing the server, which would leave the
 * development loader pointing at a dead Vite origin.
 */
const TERMINATION_SIGNALS = ['SIGINT', 'SIGHUP'] as const;

export interface TerminationProcess {
  readonly pid: number;
  on(event: 'exit', listener: () => void): unknown;
  on(event: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void): unknown;
  off(event: 'exit', listener: () => void): unknown;
  off(event: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void): unknown;
  listenerCount(event: NodeJS.Signals): number;
  kill(pid: number, signal: NodeJS.Signals): unknown;
}

/*
 * signal-exit, which Rolldown bundles into every Vite 8 process, re-raises a
 * signal only when all remaining listeners are its own, counted through these
 * shared globals. Easel counts them the same way so that neither observer waits
 * on the other while both still defer to a listener that owns shutdown.
 */
function signalExitListenerCount(): number {
  const current = (globalThis as Record<symbol, unknown>)[
    Symbol.for('signal-exit emitter')
  ];
  const legacy = (process as {__signal_exit_emitter__?: unknown}).__signal_exit_emitter__;
  return emitterCount(current) + emitterCount(legacy);
}

function emitterCount(emitter: unknown): number {
  if (typeof emitter !== 'object' || emitter === null) return 0;
  const {count} = emitter as {count?: unknown};
  return typeof count === 'number' ? count : 0;
}

/**
 * Restores the production loader when the process ends without closing the
 * Vite server. The restore is synchronous, so it completes inside `exit` and
 * signal listeners. Returns a function that detaches the listeners.
 */
export function restoreOnTermination(
  restore: () => void,
  target: TerminationProcess = process,
  passiveListenerCount: () => number = signalExitListenerCount,
): () => void {
  let restored = false;
  const restoreOnce = () => {
    if (restored) return;
    restored = true;
    restore();
  };

  const onExit = () => restoreOnce();
  const onSignal = (signal: NodeJS.Signals) => {
    restoreOnce();
    detach();
    // Re-raise so the default handler ends the process with the conventional
    // signal status, unless another listener has taken over shutdown.
    if (target.listenerCount(signal) <= passiveListenerCount()) {
      target.kill(target.pid, signal);
    }
  };
  const detach = () => {
    target.off('exit', onExit);
    for (const signal of TERMINATION_SIGNALS) target.off(signal, onSignal);
  };

  target.on('exit', onExit);
  for (const signal of TERMINATION_SIGNALS) target.on(signal, onSignal);
  return detach;
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
