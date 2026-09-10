import type {Manifest, ManifestChunk} from 'vite';
import type {EaselManifest, EaselManifestEntry, ResolvedEaselBundle} from './types.js';

export function createEaselManifest(
  viteManifest: Manifest,
  bundles: ResolvedEaselBundle[],
  emittedFiles: string[] = [],
): EaselManifest {
  const entries: Record<string, EaselManifestEntry> = {};
  const generated = new Set(emittedFiles);

  for (const bundle of bundles) {
    const chunk = findEntry(viteManifest, bundle.name);
    const {styles, imports} = collectStaticDependencies(viteManifest, chunk);

    if (bundle.script === undefined) {
      generated.delete(chunk.file);
    } else {
      generated.add(chunk.file);
    }
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
    throw new Error(`[easel] Vite manifest does not contain bundle "${name}"`);
  }
  return chunk;
}

function collectStaticDependencies(
  manifest: Manifest,
  entry: ManifestChunk,
): {styles: string[]; imports: string[]} {
  const styles = new Set<string>();
  const imports = new Set<string>();
  const visited = new Set<string>();

  const visit = (chunk: ManifestChunk): void => {
    for (const key of chunk.imports ?? []) {
      if (visited.has(key)) continue;
      visited.add(key);
      const imported = requiredChunk(manifest, key);
      imports.add(imported.file);
      visit(imported);
    }
    for (const style of chunk.css ?? []) styles.add(style);
  };

  visit(entry);
  return {styles: [...styles], imports: [...imports]};
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
      const imported = requiredChunk(manifest, key);
      files.add(imported.file);
      visit(imported);
    }
  };

  visit(entry);
}

function requiredChunk(manifest: Manifest, key: string): ManifestChunk {
  const chunk = manifest[key];
  if (chunk === undefined) {
    throw new Error(`[easel] Vite manifest import is missing: ${key}`);
  }
  return chunk;
}
