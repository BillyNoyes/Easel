import {existsSync, readFileSync, rmSync} from 'node:fs';
import {dirname, join, sep} from 'node:path';
import {
  acquireCommitLock,
  recoverInterruptedCommit,
  restoreSnapshots,
  safeResolve,
  snapshotFiles,
  writeIfChanged,
  writeTransactionJournal,
} from './transaction.js';
import type {FrameManifest, FrameOwnershipLedger, ResolvedFrameOptions} from './types.js';

export function commitProductionOutput(
  options: ResolvedFrameOptions,
  manifest: FrameManifest,
  liquid: string,
): void {
  const releaseLock = acquireCommitLock(options.commitLockPath);
  try {
    recoverInterruptedCommit(options);
    migrateLegacyProductionBackup(options);
    const previous = readLedger(options.ledgerPath, options);
    const previousFiles = new Set(previous?.generated ?? []);
    const nextFiles = new Set([
      ...manifest.generated.map((file) => ownedAssetPath(options, file)),
      ownedLiquidPath(options),
    ]);

    for (const file of manifest.generated) {
      const source = safeResolve(options.stagingPath, file);
      const destination = safeResolve(join(options.themePath, 'assets'), file);
      if (!existsSync(source)) {
        throw new Error(`[frame] generated Vite asset is missing: ${source}`);
      }
      assertOwnedOrAbsent(
        source,
        destination,
        ownedAssetPath(options, file),
        previousFiles,
      );
    }
    assertLiquidOwnedOrAbsent(
      options.liquidPath,
      ownedLiquidPath(options),
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
      options.productionLiquidPath,
      options.manifestPath,
      ...stalePaths,
      options.ledgerPath,
    ];
    const snapshots = snapshotFiles(changedPaths);
    writeTransactionJournal(options, snapshots);

    try {
      for (const file of manifest.generated) {
        writeIfChanged(
          safeResolve(join(options.themePath, 'assets'), file),
          readFileSync(safeResolve(options.stagingPath, file)),
        );
      }
      writeIfChanged(options.liquidPath, liquid);
      writeIfChanged(options.productionLiquidPath, liquid);
      writeIfChanged(options.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      for (const stale of stalePaths) {
        if (existsSync(stale)) rmSync(stale);
      }

      const ledger: FrameOwnershipLedger = {
        schemaVersion: 2,
        themePath: options.themePath,
        prefix: options.prefix,
        liquidFilename: options.liquidFilename,
        generated: [...nextFiles].sort(),
      };
      writeIfChanged(options.ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
      rmSync(options.transactionPath, {recursive: true});
    } catch (error) {
      try {
        restoreSnapshots(snapshots);
        rmSync(options.transactionPath, {recursive: true, force: true});
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          '[frame] output commit failed and could not be rolled back completely',
        );
      }
      throw error;
    }
  } finally {
    releaseLock();
  }
}

export function assertDevelopmentLiquidWritable(options: ResolvedFrameOptions): void {
  migrateLegacyProductionBackup(options);
  const previous = readLedger(options.ledgerPath, options);
  assertLiquidOwnedOrAbsent(
    options.liquidPath,
    ownedLiquidPath(options),
    new Set(previous?.generated ?? []),
  );
}

export function writeDevelopmentLiquid(
  options: ResolvedFrameOptions,
  content: string,
): () => void {
  assertDevelopmentLiquidWritable(options);
  const currentContent = existsSync(options.liquidPath)
    ? readFileSync(options.liquidPath)
    : undefined;
  if (
    currentContent !== undefined &&
    isGeneratedLiquid(currentContent.toString()) &&
    !isDevelopmentLiquid(currentContent.toString())
  ) {
    writeIfChanged(options.productionLiquidPath, currentContent);
  } else if (currentContent === undefined && existsSync(options.productionLiquidPath)) {
    rmSync(options.productionLiquidPath);
  }
  const productionContent =
    currentContent !== undefined && isDevelopmentLiquid(currentContent.toString())
      ? readProductionLiquidBackup(options)
      : currentContent;
  writeIfChanged(options.liquidPath, content);

  return () => {
    if (!existsSync(options.liquidPath)) return;
    const current = readFileSync(options.liquidPath, 'utf8');
    if (current !== content) return;
    if (productionContent === undefined) {
      rmSync(options.liquidPath);
    } else {
      writeIfChanged(options.liquidPath, productionContent);
    }
  };
}

function readLedger(
  path: string,
  options: ResolvedFrameOptions,
): FrameOwnershipLedger | undefined {
  if (!existsSync(path)) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    throw new Error(`[frame] ownership ledger is not valid JSON: ${path}`);
  }
  if (!isLedgerRecord(value) || value.themePath !== options.themePath) {
    throw new Error(`[frame] invalid ownership ledger for ${options.themePath}: ${path}`);
  }

  if (value.schemaVersion === 1 && isLegacyGeneratedList(value.generated)) {
    return {
      schemaVersion: 2,
      themePath: options.themePath,
      prefix: options.prefix,
      liquidFilename: options.liquidFilename,
      generated: value.generated,
    };
  }

  if (
    value.schemaVersion !== 2 ||
    typeof value.prefix !== 'string' ||
    typeof value.liquidFilename !== 'string' ||
    !/^[a-z0-9][a-z0-9-]*-$/.test(value.prefix) ||
    !/^[a-z0-9][a-z0-9_-]*\.liquid$/.test(value.liquidFilename) ||
    !isGeneratedList(value.generated, value.prefix, value.liquidFilename)
  ) {
    throw new Error(`[frame] invalid ownership ledger for ${options.themePath}: ${path}`);
  }
  return {
    schemaVersion: 2,
    themePath: value.themePath,
    prefix: value.prefix,
    liquidFilename: value.liquidFilename,
    generated: value.generated,
  };
}

function assertOwnedOrAbsent(
  sourcePath: string,
  destinationPath: string,
  relativePath: string,
  previousFiles: Set<string>,
): void {
  if (
    existsSync(destinationPath) &&
    !previousFiles.has(relativePath) &&
    !readFileSync(destinationPath).equals(readFileSync(sourcePath))
  ) {
    throw new Error(
      `[frame] refusing to overwrite a file Frame does not own: ${destinationPath}`,
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
  if (isGeneratedLiquid(content)) return;
  throw new Error(
    `[frame] refusing to overwrite a Liquid file Frame does not own: ${absolutePath}`,
  );
}

function isGeneratedLiquid(content: string): boolean {
  return (
    content.startsWith('{% doc %}\nGenerated asset loader managed by Frame.\n') ||
    isDevelopmentLiquid(content)
  );
}

function isDevelopmentLiquid(content: string): boolean {
  return content.startsWith(
    '{% doc %}\nGenerated development asset loader managed by Frame.\n',
  );
}

function migrateLegacyProductionBackup(options: ResolvedFrameOptions): void {
  const legacyPath = join(dirname(options.productionLiquidPath), 'production.liquid');
  if (!existsSync(legacyPath)) return;

  const legacyContent = readFileSync(legacyPath);
  if (!isGeneratedLiquid(legacyContent.toString())) {
    throw new Error(
      `[frame] legacy production backup is not generated by Frame: ${legacyPath}`,
    );
  }
  if (!existsSync(options.productionLiquidPath)) {
    writeIfChanged(options.productionLiquidPath, legacyContent);
  }
  rmSync(legacyPath);
}

function readProductionLiquidBackup(options: ResolvedFrameOptions): Buffer | undefined {
  if (!existsSync(options.productionLiquidPath)) return undefined;
  const content = readFileSync(options.productionLiquidPath);
  return isGeneratedLiquid(content.toString()) && !isDevelopmentLiquid(content.toString())
    ? content
    : undefined;
}

function ownedAssetPath(options: ResolvedFrameOptions, file: string): string {
  return namespacedAssetPath(options.prefix, file);
}

function namespacedAssetPath(prefix: string, file: string): string {
  const normalized = themeRelative(file);
  if (
    normalized.includes('/') ||
    !normalized.startsWith(prefix) ||
    normalized === prefix
  ) {
    throw new Error(`[frame] generated asset is outside Frame's namespace: ${file}`);
  }
  return `assets/${normalized}`;
}

function ownedLiquidPath(options: ResolvedFrameOptions): string {
  return `snippets/${options.liquidFilename}`;
}

function isLegacyGeneratedList(value: unknown): value is string[] {
  if (!Array.isArray(value) || !value.every((file) => typeof file === 'string')) {
    return false;
  }
  const snippets = value.filter((file) => file.startsWith('snippets/'));
  return (
    snippets.length === 1 &&
    /^snippets\/[a-z0-9][a-z0-9_-]*\.liquid$/.test(snippets[0] ?? '') &&
    value.every(
      (file) => /^assets\/[a-z0-9][a-z0-9._-]*$/.test(file) || file === snippets[0],
    )
  );
}

function isGeneratedList(
  value: unknown,
  prefix: string,
  liquidFilename: string,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (file): file is string =>
        typeof file === 'string' && isOwnedThemePath(file, prefix, liquidFilename),
    )
  );
}

function isOwnedThemePath(file: string, prefix: string, liquidFilename: string): boolean {
  if (file === `snippets/${liquidFilename}`) return true;
  if (!file.startsWith('assets/')) return false;
  try {
    return namespacedAssetPath(prefix, file.slice('assets/'.length)) === file;
  } catch {
    return false;
  }
}

function isLedgerRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function themeRelative(path: string): string {
  return path.split(sep).join('/');
}
