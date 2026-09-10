import {existsSync, readFileSync, rmSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {acquireCommitLock} from './lock.js';
import {
  assertAssetWritable,
  assertLiquidWritable,
  isDevelopmentLiquid,
  isGeneratedLiquid,
  ownedAssetPath,
  ownedLiquidPath,
  readOwnershipLedger,
} from './ownership.js';
import {
  recoverInterruptedCommit,
  runFileTransaction,
  safeResolve,
  writeIfChanged,
} from './transaction.js';
import type {EaselManifest, EaselOwnershipLedger, ResolvedEaselOptions} from './types.js';

interface PreparedAsset {
  relativePath: string;
  destinationPath: string;
  content: Buffer;
}

export function commitProductionOutput(
  options: ResolvedEaselOptions,
  manifest: EaselManifest,
  liquid: string,
): void {
  const releaseLock = acquireCommitLock(options.commitLockPath);
  try {
    recoverInterruptedCommit(options);
    migrateLegacyProductionBackup(options);

    const previous = readOwnershipLedger(options);
    const previousFiles = new Set(previous?.generated ?? []);
    const assets = prepareAssets(options, manifest.generated);
    const nextFiles = new Set([
      ...assets.map((asset) => asset.relativePath),
      ownedLiquidPath(options),
    ]);

    assertProductionOutputWritable(options, assets, previousFiles);
    const stalePaths = [...previousFiles]
      .filter((file) => !nextFiles.has(file))
      .map((file) => safeResolve(options.themePath, file));

    runFileTransaction(options, changedOutputPaths(options, assets, stalePaths), () =>
      publishProductionOutput(options, manifest, liquid, assets, stalePaths, nextFiles),
    );
  } finally {
    releaseLock();
  }
}

export function assertDevelopmentLiquidWritable(options: ResolvedEaselOptions): void {
  migrateLegacyProductionBackup(options);
  const previous = readOwnershipLedger(options);
  assertLiquidWritable(
    options.liquidPath,
    ownedLiquidPath(options),
    new Set(previous?.generated ?? []),
  );
}

export function writeDevelopmentLiquid(
  options: ResolvedEaselOptions,
  content: string,
): () => void {
  assertDevelopmentLiquidWritable(options);
  const currentContent = readOptionalFile(options.liquidPath);
  preserveProductionLiquid(options, currentContent);
  const productionContent =
    currentContent !== undefined && isDevelopmentLiquid(currentContent.toString())
      ? readProductionLiquidBackup(options)
      : currentContent;
  writeIfChanged(options.liquidPath, content);

  return () => restoreDevelopmentLiquid(options.liquidPath, content, productionContent);
}

function prepareAssets(
  options: ResolvedEaselOptions,
  generatedFiles: string[],
): PreparedAsset[] {
  return generatedFiles.map((file) => {
    const sourcePath = safeResolve(options.stagingPath, file);
    if (!existsSync(sourcePath)) {
      throw new Error(`[easel] generated Vite asset is missing: ${sourcePath}`);
    }
    return {
      relativePath: ownedAssetPath(options, file),
      destinationPath: safeResolve(join(options.themePath, 'assets'), file),
      content: readFileSync(sourcePath),
    };
  });
}

function assertProductionOutputWritable(
  options: ResolvedEaselOptions,
  assets: PreparedAsset[],
  previousFiles: Set<string>,
): void {
  for (const asset of assets) {
    assertAssetWritable(
      asset.destinationPath,
      asset.relativePath,
      asset.content,
      previousFiles,
    );
  }
  assertLiquidWritable(options.liquidPath, ownedLiquidPath(options), previousFiles);
}

function changedOutputPaths(
  options: ResolvedEaselOptions,
  assets: PreparedAsset[],
  stalePaths: string[],
): string[] {
  return [
    ...assets.map((asset) => asset.destinationPath),
    options.liquidPath,
    options.productionLiquidPath,
    options.manifestPath,
    ...stalePaths,
    options.ledgerPath,
  ];
}

function publishProductionOutput(
  options: ResolvedEaselOptions,
  manifest: EaselManifest,
  liquid: string,
  assets: PreparedAsset[],
  stalePaths: string[],
  nextFiles: Set<string>,
): void {
  for (const asset of assets) {
    writeIfChanged(asset.destinationPath, asset.content);
  }
  writeIfChanged(options.liquidPath, liquid);
  writeIfChanged(options.productionLiquidPath, liquid);
  writeIfChanged(options.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  for (const stale of stalePaths) {
    if (existsSync(stale)) rmSync(stale);
  }

  const ledger: EaselOwnershipLedger = {
    schemaVersion: 2,
    themePath: options.themePath,
    prefix: options.prefix,
    liquidFilename: options.liquidFilename,
    generated: [...nextFiles].sort(),
  };
  writeIfChanged(options.ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
}

function preserveProductionLiquid(
  options: ResolvedEaselOptions,
  currentContent: Buffer | undefined,
): void {
  if (
    currentContent !== undefined &&
    isGeneratedLiquid(currentContent.toString()) &&
    !isDevelopmentLiquid(currentContent.toString())
  ) {
    writeIfChanged(options.productionLiquidPath, currentContent);
  } else if (currentContent === undefined && existsSync(options.productionLiquidPath)) {
    rmSync(options.productionLiquidPath);
  }
}

function restoreDevelopmentLiquid(
  liquidPath: string,
  developmentContent: string,
  productionContent: Buffer | undefined,
): void {
  if (!existsSync(liquidPath)) return;
  if (readFileSync(liquidPath, 'utf8') !== developmentContent) return;
  if (productionContent === undefined) {
    rmSync(liquidPath);
  } else {
    writeIfChanged(liquidPath, productionContent);
  }
}

function migrateLegacyProductionBackup(options: ResolvedEaselOptions): void {
  const legacyPath = join(dirname(options.productionLiquidPath), 'production.liquid');
  if (!existsSync(legacyPath)) return;

  const legacyContent = readFileSync(legacyPath);
  if (!isGeneratedLiquid(legacyContent.toString())) {
    throw new Error(
      `[easel] legacy production backup is not generated by Easel: ${legacyPath}`,
    );
  }
  if (!existsSync(options.productionLiquidPath)) {
    writeIfChanged(options.productionLiquidPath, legacyContent);
  }
  rmSync(legacyPath);
}

function readProductionLiquidBackup(options: ResolvedEaselOptions): Buffer | undefined {
  const content = readOptionalFile(options.productionLiquidPath);
  return content !== undefined &&
    isGeneratedLiquid(content.toString()) &&
    !isDevelopmentLiquid(content.toString())
    ? content
    : undefined;
}

function readOptionalFile(path: string): Buffer | undefined {
  return existsSync(path) ? readFileSync(path) : undefined;
}
