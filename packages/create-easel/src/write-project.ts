import {
  constants,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  unlinkSync,
  type Stats,
} from 'node:fs';
import {dirname, join} from 'node:path';
import {assertTargetDirectory} from './directory.js';

type CreatedEntry = {path: string; metadata: Stats; contents?: Buffer};

function sameEntry(path: string, expected: Stats): boolean {
  const actual = lstatSync(path, {throwIfNoEntry: false});
  return Boolean(
    actual &&
    !actual.isSymbolicLink() &&
    actual.dev === expected.dev &&
    actual.ino === expected.ino,
  );
}

export function writeProject(source: string, target: string): void {
  let root = assertTargetDirectory(target);
  const created: CreatedEntry[] = [];
  if (!root) {
    mkdirSync(dirname(target), {recursive: true});
    mkdirSync(target);
    root = lstatSync(target);
    created.push({path: target, metadata: root});
  }
  const directories = new Map([[target, root]]);
  const directoriesIntact = () =>
    [...directories].every(([path, metadata]) => sameEntry(path, metadata));

  function copy(directory: string, destination: string): void {
    for (const entry of readdirSync(directory, {withFileTypes: true})) {
      if (!directoriesIntact())
        throw new Error('The target directory changed during generation.');
      const input = join(directory, entry.name);
      const output = join(destination, entry.name);
      if (entry.isDirectory()) {
        mkdirSync(output);
        const metadata = lstatSync(output);
        created.push({path: output, metadata});
        directories.set(output, metadata);
        copy(input, output);
      } else if (entry.isFile()) {
        const contents = readFileSync(input);
        copyFileSync(input, output, constants.COPYFILE_EXCL);
        created.push({path: output, metadata: lstatSync(output), contents});
      } else {
        throw new Error(`Unsupported generated entry: ${input}`);
      }
    }
  }

  try {
    copy(source, target);
  } catch (error) {
    // Keep pre-existing entries and concurrent edits; only remove unchanged output.
    for (const entry of created.reverse()) {
      try {
        if (!directoriesIntact() || !sameEntry(entry.path, entry.metadata)) continue;
        if (entry.contents !== undefined) {
          if (readFileSync(entry.path).equals(entry.contents)) unlinkSync(entry.path);
        } else {
          rmdirSync(entry.path);
          directories.delete(entry.path);
        }
      } catch {
        // Leave inaccessible paths and nonempty directories for the user to inspect.
      }
    }
    throw error;
  }
}
