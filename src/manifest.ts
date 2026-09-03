import type {Manifest, ManifestChunk} from 'vite';
import type {
  FrameManifest,
  FrameManifestEntry,
  ResolvedFrameBundle,
} from './types.js';

export function createFrameManifest(
  viteManifest: Manifest,
  bundles: ResolvedFrameBundle[],
): FrameManifest {
  const entries: Record<string, FrameManifestEntry> = {};
  const generated = new Set<string>();

  for (const bundle of bundles) {
    const chunk = findEntry(viteManifest, bundle.name);
    const styles = collectStaticStyles(viteManifest, chunk);
    const imports = collectStaticImports(viteManifest, chunk);

    generated.add(chunk.file);
    for (const style of styles) generated.add(style);
    for (const imported of imports) generated.add(imported);
    collectGeneratedFiles(viteManifest, chunk, generated);

    entries[bundle.name] = {
      ...(bundle.script === undefined ? {} : {script: chunk.file}),
      styles,
      imports,
    };
  }

  return {
    schemaVersion: 1,
    entries,
    generated: [...generated].sort(),
  };
}

function findEntry(manifest: Manifest, name: string): ManifestChunk {
  const chunk = Object.values(manifest).find(
    (candidate) => candidate.isEntry === true && candidate.name === name,
  );
  if (chunk === undefined) {
    throw new Error(`[frame] Vite manifest does not contain bundle "${name}"`);
  }
  return chunk;
}

function collectStaticStyles(
  manifest: Manifest,
  entry: ManifestChunk,
): string[] {
  const files = new Set<string>();
  const visited = new Set<string>();

  const visit = (chunk: ManifestChunk): void => {
    for (const key of chunk.imports ?? []) {
      if (visited.has(key)) continue;
      visited.add(key);
      const imported = manifest[key];
      if (imported === undefined) {
        throw new Error(`[frame] Vite manifest import is missing: ${key}`);
      }
      visit(imported);
    }
    for (const style of chunk.css ?? []) files.add(style);
  };

  visit(entry);
  return [...files];
}

function collectStaticImports(
  manifest: Manifest,
  entry: ManifestChunk,
): string[] {
  const files = new Set<string>();
  const visited = new Set<string>();

  const visit = (chunk: ManifestChunk): void => {
    for (const key of chunk.imports ?? []) {
      if (visited.has(key)) continue;
      visited.add(key);
      const imported = manifest[key];
      if (imported === undefined) {
        throw new Error(`[frame] Vite manifest import is missing: ${key}`);
      }
      files.add(imported.file);
      visit(imported);
    }
  };

  visit(entry);
  return [...files];
}

function collectGeneratedFiles(
  manifest: Manifest,
  entry: ManifestChunk,
  files: Set<string>,
): void {
  const visited = new Set<string>();

  const visit = (chunk: ManifestChunk): void => {
    for (const asset of chunk.assets ?? []) files.add(asset);
    for (const style of chunk.css ?? []) files.add(style);
    for (const key of [...(chunk.imports ?? []), ...(chunk.dynamicImports ?? [])]) {
      if (visited.has(key)) continue;
      visited.add(key);
      const imported = manifest[key];
      if (imported === undefined) {
        throw new Error(`[frame] Vite manifest import is missing: ${key}`);
      }
      files.add(imported.file);
      visit(imported);
    }
  };

  visit(entry);
}
