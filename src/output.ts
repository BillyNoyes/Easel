import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {dirname, join, relative, resolve, sep} from 'node:path';
import type {
  FrameManifest,
  FrameOwnershipLedger,
  ResolvedFrameOptions,
} from './types.js';

export function commitProductionOutput(
  options: ResolvedFrameOptions,
  manifest: FrameManifest,
  liquid: string,
): void {
  const previous = readLedger(options.ledgerPath, options.themePath);
  const previousFiles = new Set(previous?.generated ?? []);
  const nextFiles = new Set([
    ...manifest.generated.map((file) => themeRelative(join('assets', file))),
    themeRelative(join('snippets', options.liquidFilename)),
  ]);

  for (const file of manifest.generated) {
    const source = safeResolve(options.stagingPath, file);
    const destination = safeResolve(join(options.themePath, 'assets'), file);
    if (!existsSync(source)) {
      throw new Error(`[frame] generated Vite asset is missing: ${source}`);
    }
    assertOwnedOrAbsent(destination, themeRelative(join('assets', file)), previousFiles);
  }
  assertLiquidOwnedOrAbsent(
    options.liquidPath,
    themeRelative(join('snippets', options.liquidFilename)),
    previousFiles,
  );

  const stalePaths = [...previousFiles]
    .filter((file) => !nextFiles.has(file))
    .map((file) => safeResolve(options.themePath, file));
  const changedPaths = [
    ...manifest.generated.map((file) =>
      safeResolve(join(options.themePath, 'assets'), file),
    ),
    options.liquidPath,
    ...stalePaths,
    options.ledgerPath,
  ];
  const snapshots = snapshotFiles(changedPaths);

  try {
    for (const file of manifest.generated) {
      copyAtomically(
        safeResolve(options.stagingPath, file),
        safeResolve(join(options.themePath, 'assets'), file),
      );
    }
    writeAtomically(options.liquidPath, liquid);

    for (const stale of stalePaths) {
      if (existsSync(stale)) rmSync(stale);
    }

    const ledger: FrameOwnershipLedger = {
      schemaVersion: 1,
      themePath: options.themePath,
      generated: [...nextFiles].sort(),
    };
    writeAtomically(options.ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  } catch (error) {
    restoreSnapshots(snapshots);
    throw error;
  }
}

export function writeDevelopmentLiquid(
  options: ResolvedFrameOptions,
  content: string,
): void {
  if (existsSync(options.liquidPath)) {
    const current = readFileSync(options.liquidPath, 'utf8');
    if (current === content) return;
  }

  const previous = readLedger(options.ledgerPath, options.themePath);
  assertLiquidOwnedOrAbsent(
    options.liquidPath,
    themeRelative(join('snippets', options.liquidFilename)),
    new Set(previous?.generated ?? []),
  );
  writeAtomically(options.liquidPath, content);
}

function readLedger(
  path: string,
  themePath: string,
): FrameOwnershipLedger | undefined {
  if (!existsSync(path)) return undefined;
  const value = JSON.parse(readFileSync(path, 'utf8')) as FrameOwnershipLedger;
  if (
    value.schemaVersion !== 1 ||
    value.themePath !== themePath ||
    !Array.isArray(value.generated)
  ) {
    throw new Error(`[frame] invalid ownership ledger for ${themePath}: ${path}`);
  }
  return value;
}

function assertOwnedOrAbsent(
  absolutePath: string,
  relativePath: string,
  previousFiles: Set<string>,
): void {
  if (existsSync(absolutePath) && !previousFiles.has(relativePath)) {
    throw new Error(
      `[frame] refusing to overwrite a file Frame does not own: ${absolutePath}`,
    );
  }
}

function assertLiquidOwnedOrAbsent(
  absolutePath: string,
  relativePath: string,
  previousFiles: Set<string>,
): void {
  if (!existsSync(absolutePath) || previousFiles.has(relativePath)) return;
  const content = readFileSync(absolutePath, 'utf8');
  if (content.startsWith('{% doc %}\nGenerated') && content.includes('managed by Frame.')) {
    return;
  }
  throw new Error(
    `[frame] refusing to overwrite a Liquid file Frame does not own: ${absolutePath}`,
  );
}

function snapshotFiles(paths: string[]): Map<string, Buffer | undefined> {
  return new Map(
    [...new Set(paths)].map((path) => [
      path,
      existsSync(path) ? readFileSync(path) : undefined,
    ]),
  );
}

function restoreSnapshots(snapshots: Map<string, Buffer | undefined>): void {
  for (const [path, content] of snapshots) {
    if (content === undefined) {
      if (existsSync(path)) rmSync(path);
    } else {
      writeAtomically(path, content);
    }
  }
}

function themeRelative(path: string): string {
  return path.split(sep).join('/');
}

function safeResolve(root: string, path: string): string {
  const base = resolve(root);
  const result = resolve(base, path);
  const relativePath = relative(base, result);
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`)) {
    throw new Error(`[frame] output escapes its allowed root: ${path}`);
  }
  return result;
}

function copyAtomically(source: string, destination: string): void {
  writeAtomically(destination, readFileSync(source));
}

function writeAtomically(path: string, content: string | Buffer): void {
  mkdirSync(dirname(path), {recursive: true});
  const temporary = `${path}.frame-${process.pid}-${Date.now()}`;
  writeFileSync(temporary, content);
  renameSync(temporary, path);
}
