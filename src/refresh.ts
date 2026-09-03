import {existsSync, mkdirSync, watch, writeFileSync} from 'node:fs';
import {basename, dirname} from 'node:path';

export function watchRefreshSignal(
  signalPath: string,
  delay: number,
  refresh: () => void,
): () => void {
  const directory = dirname(signalPath);
  const filename = basename(signalPath);
  mkdirSync(directory, {recursive: true});
  if (!existsSync(signalPath)) writeFileSync(signalPath, '');

  let timer: ReturnType<typeof setTimeout> | undefined;
  const watcher = watch(directory, (_event, changed) => {
    if (changed !== filename) return;
    clearTimeout(timer);
    timer = setTimeout(refresh, delay);
  });

  return () => {
    clearTimeout(timer);
    watcher.close();
  };
}
