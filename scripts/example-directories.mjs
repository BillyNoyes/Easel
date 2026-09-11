import {existsSync, readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

export function exampleDirectories() {
  const examplesRoot = resolve(repositoryRoot, 'examples');
  return readdirSync(examplesRoot, {withFileTypes: true})
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(resolve(examplesRoot, entry.name, 'package.json')),
    )
    .map((entry) => resolve(examplesRoot, entry.name))
    .sort();
}
