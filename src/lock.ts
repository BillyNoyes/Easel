import {randomUUID} from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import {dirname, join} from 'node:path';

interface LockOwner {
  pid: number;
  token: string;
}

export function acquireCommitLock(lockPath: string): () => void {
  mkdirSync(dirname(lockPath), {recursive: true});
  const token = randomUUID();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      createLock(lockPath, token);
      return () => releaseLock(lockPath, token);
    } catch (error) {
      if (!isAlreadyExistsError(error)) throw error;
      if (!isStaleLock(lockPath)) {
        throw new Error(`[easel] another build is publishing this theme: ${lockPath}`);
      }
      rmSync(lockPath, {recursive: true});
    }
  }

  throw new Error(`[easel] could not acquire the theme commit lock: ${lockPath}`);
}

function createLock(lockPath: string, token: string): void {
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
}

function releaseLock(lockPath: string, token: string): void {
  if (readLockOwner(lockPath)?.token === token) {
    rmSync(lockPath, {recursive: true});
  }
}

function isStaleLock(lockPath: string): boolean {
  const metadata = lstatSync(lockPath);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`[easel] commit lock must be a real directory: ${lockPath}`);
  }
  const owner = readLockOwner(lockPath);
  if (owner === undefined) {
    return Date.now() - statSync(lockPath).mtimeMs > 30_000;
  }
  try {
    process.kill(owner.pid, 0);
    return false;
  } catch (error) {
    return isNodeError(error) && error.code === 'ESRCH';
  }
}

function readLockOwner(lockPath: string): LockOwner | undefined {
  try {
    const value = JSON.parse(
      readFileSync(join(lockPath, 'owner.json'), 'utf8'),
    ) as unknown;
    if (isLockOwner(value)) return value;
  } catch {
    return undefined;
  }
  return undefined;
}

function isLockOwner(value: unknown): value is LockOwner {
  return (
    typeof value === 'object' &&
    value !== null &&
    'pid' in value &&
    typeof value.pid === 'number' &&
    Number.isInteger(value.pid) &&
    value.pid > 0 &&
    'token' in value &&
    typeof value.token === 'string' &&
    value.token.length > 0
  );
}

function isAlreadyExistsError(error: unknown): boolean {
  return isNodeError(error) && error.code === 'EEXIST';
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
