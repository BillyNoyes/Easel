import type {Plugin} from 'vite';
import type {ResolvedFrameBundle} from './types.js';

const INTERNAL_PREFIX = '\0frame:';
export const PUBLIC_PREFIX = '/@frame/';

export function virtualBundleId(name: string): string {
  return `${INTERNAL_PREFIX}${name}`;
}

export function frameVirtualBundles(
  getBundles: () => ResolvedFrameBundle[],
): Plugin {
  return {
    name: 'frame:virtual-bundles',
    enforce: 'pre',
    resolveId(id) {
      if (id.startsWith(PUBLIC_PREFIX)) {
        const name = id.slice(PUBLIC_PREFIX.length);
        if (getBundles().some((bundle) => bundle.name === name)) {
          return virtualBundleId(name);
        }
      }
      if (id.startsWith(INTERNAL_PREFIX)) return id;
      return undefined;
    },
    load(id) {
      if (!id.startsWith(INTERNAL_PREFIX)) return undefined;
      const name = id.slice(INTERNAL_PREFIX.length);
      const bundle = getBundles().find((candidate) => candidate.name === name);
      if (bundle === undefined) {
        throw new Error(`[frame] unknown virtual bundle "${name}"`);
      }

      const imports = [bundle.style, bundle.script]
        .filter((path): path is string => path !== undefined)
        .map((path) => `import ${JSON.stringify(path)};`);

      return `${imports.join('\n')}\n`;
    },
  };
}
