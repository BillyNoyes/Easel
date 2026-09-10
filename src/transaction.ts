import {randomUUID} from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {dirname, join, relative, resolve, sep} from 'node:path';
import type {ResolvedEaselOptions} from './types.js';
import {SAFE_ASSET_FILENAME, SAFE_LIQUID_FILENAME} from './validation.js';

interface TransactionEntry {
  scope: 'theme' | 'state';
  path: string;
  existed: boolean;
  blob?: string;
}

interface TransactionJournal {
  schemaVersion: 1;
  themePath: string;
  entries: TransactionEntry[];
}

type FileSnapshots = Map<string, Buffer | undefined>;

function snapshotFiles(paths: string[]): FileSnapshots {
  return new Map(
    [...new Set(paths)].map((path) => [
      path,
      existsSync(path) ? readFileSync(path) : undefined,
    ]),
  );
}

function restoreSnapshots(snapshots: FileSnapshots): void {
  for (const [path, content] of snapshots) {
    if (content === undefined) {
      if (existsSync(path)) rmSync(path);
    } else {
      writeIfChanged(path, content);
    }
  }
}

function writeTransactionJournal(
  options: ResolvedEaselOptions,
  snapshots: FileSnapshots,
): void {
  const temporary = `${options.transactionPath}-${randomUUID()}`;
  mkdirSync(temporary, {recursive: true});
  try {
    const entries: TransactionEntry[] = [];
    let index = 0;
    for (const [path, content] of snapshots) {
      const location = journalLocation(options, path);
      if (content === undefined) {
        entries.push({...location, existed: false});
      } else {
        const blob = `${index}.bin`;
        writeFileSync(join(temporary, blob), content);
        entries.push({...location, existed: true, blob});
        index += 1;
      }
    }
    const journal: TransactionJournal = {
      schemaVersion: 1,
      themePath: options.themePath,
      entries,
    };
    writeFileSync(
      join(temporary, 'journal.json'),
      `${JSON.stringify(journal, null, 2)}\n`,
    );
    renameSync(temporary, options.transactionPath);
  } finally {
    if (existsSync(temporary)) rmSync(temporary, {recursive: true});
  }
}

export function runFileTransaction(
  options: ResolvedEaselOptions,
  paths: string[],
  action: () => void,
): void {
  const snapshots = snapshotFiles(paths);
  writeTransactionJournal(options, snapshots);

  try {
    action();
    rmSync(options.transactionPath, {recursive: true});
  } catch (error) {
    try {
      restoreSnapshots(snapshots);
      rmSync(options.transactionPath, {recursive: true, force: true});
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        '[easel] output commit failed and could not be rolled back completely',
      );
    }
    throw error;
  }
}

export function recoverInterruptedCommit(options: ResolvedEaselOptions): void {
  if (!existsSync(options.transactionPath)) return;
  const metadata = lstatSync(options.transactionPath);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(
      `[easel] transaction journal must be a real directory: ${options.transactionPath}`,
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(
      readFileSync(join(options.transactionPath, 'journal.json'), 'utf8'),
    ) as unknown;
  } catch {
    throw new Error(
      `[easel] interrupted transaction journal is invalid: ${options.transactionPath}`,
    );
  }
  if (!isTransactionJournal(value) || value.themePath !== options.themePath) {
    throw new Error(
      `[easel] interrupted transaction journal is invalid: ${options.transactionPath}`,
    );
  }

  const snapshots: FileSnapshots = new Map();
  for (const entry of value.entries) {
    const path = resolveJournalLocation(options, entry);
    if (!entry.existed) {
      snapshots.set(path, undefined);
      continue;
    }
    if (entry.blob === undefined || !/^\d+\.bin$/.test(entry.blob)) {
      throw new Error(
        `[easel] interrupted transaction journal is invalid: ${options.transactionPath}`,
      );
    }
    const blobPath = join(options.transactionPath, entry.blob);
    if (!existsSync(blobPath)) {
      throw new Error(`[easel] interrupted transaction snapshot is missing: ${blobPath}`);
    }
    snapshots.set(path, readFileSync(blobPath));
  }

  restoreSnapshots(snapshots);
  rmSync(options.transactionPath, {recursive: true});
}

export function safeResolve(root: string, path: string): string {
  const base = resolve(root);
  const result = resolve(base, path);
  const relativePath = relative(base, result);
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`)) {
    throw new Error(`[easel] output escapes its allowed root: ${path}`);
  }
  return result;
}

export function writeIfChanged(path: string, content: string | Buffer): void {
  const next = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (existsSync(path) && readFileSync(path).equals(next)) return;
  mkdirSync(dirname(path), {recursive: true});
  const temporary = `${path}.easel-${process.pid}-${Date.now()}`;
  writeFileSync(temporary, next);
  try {
    if (process.platform === 'win32' && existsSync(path)) {
      replaceFileOnWindows(temporary, path);
    } else {
      renameSync(temporary, path);
    }
  } finally {
    if (existsSync(temporary)) rmSync(temporary);
  }
}

function journalLocation(
  options: ResolvedEaselOptions,
  path: string,
): Pick<TransactionEntry, 'scope' | 'path'> {
  const statePath = relativeWithin(dirname(options.ledgerPath), path);
  if (statePath !== undefined) {
    return assertJournalLocation({scope: 'state', path: statePath});
  }
  const themePath = relativeWithin(options.themePath, path);
  if (themePath !== undefined) {
    return assertJournalLocation({scope: 'theme', path: themePath});
  }
  throw new Error(`[easel] cannot journal output outside Easel's roots: ${path}`);
}

function resolveJournalLocation(
  options: ResolvedEaselOptions,
  entry: TransactionEntry,
): string {
  assertJournalLocation(entry);
  const root = entry.scope === 'theme' ? options.themePath : dirname(options.ledgerPath);
  const path = safeResolve(root, entry.path);
  if (relativeWithin(root, path) !== entry.path) {
    throw new Error(
      `[easel] interrupted transaction journal contains an invalid path: ${entry.path}`,
    );
  }
  return path;
}

function assertJournalLocation<T extends Pick<TransactionEntry, 'scope' | 'path'>>(
  location: T,
): T {
  const valid =
    location.scope === 'theme'
      ? isJournalThemePath(location.path)
      : ['outputs.json', 'production.txt', 'production.liquid', 'manifest.json'].includes(
          location.path,
        );
  if (!valid) {
    throw new Error(
      `[easel] transaction journal contains an invalid path: ${location.path}`,
    );
  }
  return location;
}

function isJournalThemePath(path: string): boolean {
  const [directory, filename, extra] = path.split('/');
  if (filename === undefined || extra !== undefined) return false;
  if (directory === 'assets') return SAFE_ASSET_FILENAME.test(filename);
  return directory === 'snippets' && SAFE_LIQUID_FILENAME.test(filename);
}

function relativeWithin(root: string, path: string): string | undefined {
  const value = relative(resolve(root), resolve(path));
  if (value === '' || value === '..' || value.startsWith(`..${sep}`)) {
    return undefined;
  }
  return value.split(sep).join('/');
}

function isTransactionJournal(value: unknown): value is TransactionJournal {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('schemaVersion' in value) ||
    value.schemaVersion !== 1 ||
    !('themePath' in value) ||
    typeof value.themePath !== 'string' ||
    !('entries' in value) ||
    !Array.isArray(value.entries)
  ) {
    return false;
  }
  return value.entries.every((entry: unknown) => isTransactionEntry(entry));
}

function isTransactionEntry(entry: unknown): entry is TransactionEntry {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    'scope' in entry &&
    (entry.scope === 'theme' || entry.scope === 'state') &&
    'path' in entry &&
    typeof entry.path === 'string' &&
    'existed' in entry &&
    typeof entry.existed === 'boolean' &&
    (!('blob' in entry) || entry.blob === undefined || typeof entry.blob === 'string')
  );
}

function replaceFileOnWindows(temporary: string, destination: string): void {
  const backup = `${temporary}.previous`;
  renameSync(destination, backup);
  try {
    renameSync(temporary, destination);
    rmSync(backup);
  } catch (error) {
    if (existsSync(destination)) rmSync(destination);
    renameSync(backup, destination);
    throw error;
  }
}
