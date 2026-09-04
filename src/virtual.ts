import type {Plugin} from 'vite';
import type {ResolvedFrameBundle} from './types.js';

const INTERNAL_PREFIX = '\0frame:';
export const PUBLIC_PREFIX = '/@frame/';

export function virtualBundleId(name: string): string {
  return `${INTERNAL_PREFIX}${name}`;
}

export function frameBundleModules(getBundles: () => ResolvedFrameBundle[]): Plugin {
  return {
    name: 'frame:bundle-modules',
    enforce: 'pre',
    resolveId(id) {
      const bundles = getBundles();
      if (id.startsWith(PUBLIC_PREFIX)) {
        const name = id.slice(PUBLIC_PREFIX.length);
        if (bundles.some((bundle) => bundle.name === name)) {
          return virtualBundleId(name);
        }
      }
      if (id.startsWith(INTERNAL_PREFIX)) return id;

      const normalizedId = normalizeModulePath(id);
      const isBundleInput = bundles
        .flatMap(bundleInputs)
        .some((path) => normalizeModulePath(path) === normalizedId);
      // Bundle inputs are storefront entry points even when their exports are unused.
      return isBundleInput ? {id: normalizedId, moduleSideEffects: true} : undefined;
    },
    load(id) {
      if (!id.startsWith(INTERNAL_PREFIX)) return undefined;
      const name = id.slice(INTERNAL_PREFIX.length);
      const bundle = getBundles().find((candidate) => candidate.name === name);
      if (bundle === undefined) {
        throw new Error(`[frame] unknown virtual bundle "${name}"`);
      }

      return `${bundleInputs(bundle)
        .map((path) => `import ${JSON.stringify(path)};`)
        .join('\n')}\n`;
    },
  };
}

function bundleInputs(bundle: ResolvedFrameBundle): string[] {
  return [bundle.script, bundle.style].filter(
    (path): path is string => path !== undefined,
  );
}

function normalizeModulePath(path: string): string {
  return path.replaceAll('\\', '/');
}
