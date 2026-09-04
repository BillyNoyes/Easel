import {existsSync, readFileSync} from 'node:fs';
import {sep} from 'node:path';
import type {FrameOwnershipLedger, ResolvedFrameOptions} from './types.js';
import {
  SAFE_ASSET_FILENAME,
  SAFE_LIQUID_FILENAME,
  SAFE_OUTPUT_NAME,
} from './validation.js';

export function readOwnershipLedger(
  options: ResolvedFrameOptions,
): FrameOwnershipLedger | undefined {
  const path = options.ledgerPath;
  if (!existsSync(path)) return undefined;

  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    throw new Error(`[frame] ownership ledger is not valid JSON: ${path}`);
  }
  if (!isRecord(value) || value.themePath !== options.themePath) {
    throw invalidLedger(options);
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

  if (!isCurrentLedger(value)) throw invalidLedger(options);
  return value;
}

export function ownedAssetPath(
  options: Pick<ResolvedFrameOptions, 'prefix'>,
  file: string,
): string {
  return namespacedAssetPath(options.prefix, file);
}

export function ownedLiquidPath(
  options: Pick<ResolvedFrameOptions, 'liquidFilename'>,
): string {
  return `snippets/${options.liquidFilename}`;
}

export function assertAssetWritable(
  destinationPath: string,
  relativePath: string,
  content: Buffer,
  previousFiles: Set<string>,
): void {
  if (
    existsSync(destinationPath) &&
    !previousFiles.has(relativePath) &&
    !readFileSync(destinationPath).equals(content)
  ) {
    throw new Error(
      `[frame] refusing to overwrite a file Frame does not own: ${destinationPath}`,
    );
  }
}

export function assertLiquidWritable(
  absolutePath: string,
  relativePath: string,
  previousFiles: Set<string>,
): void {
  if (!existsSync(absolutePath) || previousFiles.has(relativePath)) return;
  if (isGeneratedLiquid(readFileSync(absolutePath, 'utf8'))) return;
  throw new Error(
    `[frame] refusing to overwrite a Liquid file Frame does not own: ${absolutePath}`,
  );
}

export function isGeneratedLiquid(content: string): boolean {
  return (
    content.startsWith('{% doc %}\nGenerated asset loader managed by Frame.\n') ||
    isDevelopmentLiquid(content)
  );
}

export function isDevelopmentLiquid(content: string): boolean {
  return content.startsWith(
    '{% doc %}\nGenerated development asset loader managed by Frame.\n',
  );
}

function isCurrentLedger(
  value: Record<string, unknown>,
): value is FrameOwnershipLedger & Record<string, unknown> {
  if (
    value.schemaVersion !== 2 ||
    typeof value.themePath !== 'string' ||
    typeof value.prefix !== 'string' ||
    typeof value.liquidFilename !== 'string'
  ) {
    return false;
  }
  const namespace = value.prefix.slice(0, -1);
  return (
    value.prefix.endsWith('-') &&
    SAFE_OUTPUT_NAME.test(namespace) &&
    SAFE_LIQUID_FILENAME.test(value.liquidFilename) &&
    isGeneratedList(value.generated, value.prefix, value.liquidFilename)
  );
}

function isLegacyGeneratedList(value: unknown): value is string[] {
  if (!Array.isArray(value) || !value.every((file) => typeof file === 'string')) {
    return false;
  }
  const snippets = value.filter((file) => file.startsWith('snippets/'));
  return (
    snippets.length === 1 &&
    SAFE_LIQUID_FILENAME.test(snippets[0]?.slice('snippets/'.length) ?? '') &&
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

function namespacedAssetPath(prefix: string, file: string): string {
  const normalized = file.split(sep).join('/');
  if (
    !SAFE_ASSET_FILENAME.test(normalized) ||
    !normalized.startsWith(prefix) ||
    normalized === prefix
  ) {
    throw new Error(`[frame] generated asset is outside Frame's namespace: ${file}`);
  }
  return `assets/${normalized}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function invalidLedger(options: ResolvedFrameOptions): Error {
  return new Error(
    `[frame] invalid ownership ledger for ${options.themePath}: ${options.ledgerPath}`,
  );
}
