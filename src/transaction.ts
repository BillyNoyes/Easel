import {randomUUID} from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import {dirname, join, relative, resolve, sep} from 'node:path';
import type {ResolvedFrameOptions} from './types.js';

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

export type FileSnapshots = Map<string, Buffer | undefined>;

export function acquireCommitLock(lockPath: string): () => void {
  mkdirSync(dirname(lockPath), {recursive: true});
  const token = randomUUID();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      mkdirSync(lockPath);
      try {
        writeFileSync(
          join(lockPath, 'owner.json'),
          `${JSON.stringify({pid: process.pid, token})}\n`,
        );
      } catch (error) {
        rmSync(lockPath, {recursive: true});
        throw error;
      }
      return () => {
        const owner = readLockOwner(lockPath);
        if (owner?.token === token) rmSync(lockPath, {recursive: true});
      };
    } catch (error) {
      if (!isAlreadyExistsError(error)) throw error;
      if (!isStaleLock(lockPath)) {
        throw new Error(`[frame] another build is publishing this theme: ${lockPath}`);
      }
      rmSync(lockPath, {recursive: true});
    }
  }

  throw new Error(`[frame] could not acquire the theme commit lock: ${lockPath}`);
}

export function snapshotFiles(paths: string[]): FileSnapshots {
  return new Map(
    [...new Set(paths)].map((path) => [
      path,
      existsSync(path) ? readFileSync(path) : undefined,
    ]),
  );
}

export function restoreSnapshots(snapshots: FileSnapshots): void {
  for (const [path, content] of snapshots) {
    if (content === undefined) {
      if (existsSync(path)) rmSync(path);
    } else {
      writeIfChanged(path, content);
    }
  }
}

export function writeTransactionJournal(
  options: ResolvedFrameOptions,
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

export function recoverInterruptedCommit(options: ResolvedFrameOptions): void {
  if (!existsSync(options.transactionPath)) return;
  const metadata = lstatSync(options.transactionPath);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(
      `[frame] transaction journal must be a real directory: ${options.transactionPath}`,
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(
      readFileSync(join(options.transactionPath, 'journal.json'), 'utf8'),
    ) as unknown;
  } catch {
    throw new Error(
      `[frame] interrupted transaction journal is invalid: ${options.transactionPath}`,
    );
  }
  if (!isTransactionJournal(value) || value.themePath !== options.themePath) {
    throw new Error(
      `[frame] interrupted transaction journal is invalid: ${options.transactionPath}`,
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
        `[frame] interrupted transaction journal is invalid: ${options.transactionPath}`,
      );
    }
    const blobPath = join(options.transactionPath, entry.blob);
    if (!existsSync(blobPath)) {
      throw new Error(`[frame] interrupted transaction snapshot is missing: ${blobPath}`);
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
    throw new Error(`[frame] output escapes its allowed root: ${path}`);
  }
  return result;
}

export function writeIfChanged(path: string, content: string | Buffer): void {
  const next = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (existsSync(path) && readFileSync(path).equals(next)) return;
  mkdirSync(dirname(path), {recursive: true});
  const temporary = `${path}.frame-${process.pid}-${Date.now()}`;
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
  options: ResolvedFrameOptions,
  path: string,
): Pick<TransactionEntry, 'scope' | 'path'> {
  const themePath = relativeWithin(options.themePath, path);
  if (themePath !== undefined) return {scope: 'theme', path: themePath};
  const statePath = relativeWithin(dirname(options.ledgerPath), path);
  if (statePath !== undefined) return {scope: 'state', path: statePath};
  throw new Error(`[frame] cannot journal output outside Frame's roots: ${path}`);
}

function resolveJournalLocation(
  options: ResolvedFrameOptions,
  entry: TransactionEntry,
): string {
  if (
    (entry.scope === 'theme' && !isJournalThemePath(entry.path)) ||
    (entry.scope === 'state' &&
      !['outputs.json', 'production.liquid', 'manifest.json'].includes(entry.path))
  ) {
    throw new Error(
      `[frame] interrupted transaction journal contains an invalid path: ${entry.path}`,
    );
  }
  const root = entry.scope === 'theme' ? options.themePath : dirname(options.ledgerPath);
  const path = safeResolve(root, entry.path);
  if (relativeWithin(root, path) !== entry.path) {
    throw new Error(
      `[frame] interrupted transaction journal contains an invalid path: ${entry.path}`,
    );
  }
  return path;
}

function isJournalThemePath(path: string): boolean {
  return (
    /^assets\/[a-z0-9][a-z0-9._-]*$/.test(path) ||
    /^snippets\/[a-z0-9][a-z0-9_-]*\.liquid$/.test(path)
  );
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

function isStaleLock(lockPath: string): boolean {
  const metadata = lstatSync(lockPath);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`[frame] commit lock must be a real directory: ${lockPath}`);
  }
  const owner = readLockOwner(lockPath);
  if (owner === undefined) {
    return Date.now() - statSync(lockPath).mtimeMs > 30_000;
  }
  try {
    process.kill(owner.pid, 0);
    return false;
  } catch (error) {
    return isNoSuchProcessError(error);
  }
}

function readLockOwner(lockPath: string): {pid: number; token: string} | undefined {
  try {
    const value = JSON.parse(
      readFileSync(join(lockPath, 'owner.json'), 'utf8'),
    ) as unknown;
    if (
      typeof value === 'object' &&
      value !== null &&
      'pid' in value &&
      'token' in value &&
      typeof value.pid === 'number' &&
      Number.isInteger(value.pid) &&
      value.pid > 0 &&
      typeof value.token === 'string' &&
      value.token.length > 0
    ) {
      return {pid: value.pid, token: value.token};
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function isAlreadyExistsError(error: unknown): boolean {
  return isNodeError(error) && error.code === 'EEXIST';
}

function isNoSuchProcessError(error: unknown): boolean {
  return isNodeError(error) && error.code === 'ESRCH';
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
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
