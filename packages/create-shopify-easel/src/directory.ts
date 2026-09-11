import {lstatSync, readdirSync} from 'node:fs';

const preservedEntries = new Set(['.git', '.DS_Store']);

export function assertTargetDirectory(target: string) {
  const metadata = lstatSync(target, {throwIfNoEntry: false});
  if (!metadata) return;
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(`Target already exists and is not a regular directory: ${target}.`);
  }
  if (readdirSync(target).some((name) => !preservedEntries.has(name))) {
    throw new Error(
      `Target already exists and is not empty: ${target}. Use an empty directory (.git and .DS_Store are allowed). Existing files are never overwritten.`,
    );
  }
  return metadata;
}
