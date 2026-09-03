import {existsSync, mkdirSync, statSync, writeFileSync} from 'node:fs';
import type {Stats} from 'node:fs';
import {dirname} from 'node:path';

const POLL_INTERVAL = 50;

export function watchRefreshSignal(
  signalPath: string,
  delay: number,
  refresh: () => void,
): () => void {
  mkdirSync(dirname(signalPath), {recursive: true});
  if (!existsSync(signalPath)) writeFileSync(signalPath, '');

  let previous = readStats(signalPath);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const poller = setInterval(() => {
    const current = readStats(signalPath);
    if (sameStats(current, previous)) return;
    previous = current;
    clearTimeout(timer);
    timer = setTimeout(refresh, delay);
  }, POLL_INTERVAL);
  poller.unref();

  return () => {
    clearTimeout(timer);
    clearInterval(poller);
  };
}

function readStats(path: string): Stats | undefined {
  try {
    return statSync(path);
  } catch {
    return undefined;
  }
}

function sameStats(current: Stats | undefined, previous: Stats | undefined): boolean {
  if (current === undefined || previous === undefined) return current === previous;
  return (
    current.mtimeMs === previous.mtimeMs &&
    current.ctimeMs === previous.ctimeMs &&
    current.size === previous.size
  );
}
