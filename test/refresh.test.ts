import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {watchRefreshSignal} from '../src/refresh.js';

describe('watchRefreshSignal', () => {
  it('combines repeated Shopify CLI notifications into one refresh', async () => {
    const root = mkdtempSync(join(tmpdir(), 'frame-refresh-'));
    const signal = join(root, '.frame/shopify-ready');
    let refreshes = 0;
    let resolveRefresh: (() => void) | undefined;
    const refreshed = new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    });
    const stop = watchRefreshSignal(signal, 30, () => {
      refreshes += 1;
      resolveRefresh?.();
    });

    try {
      writeFileSync(signal, 'first');
      writeFileSync(signal, 'second');
      await refreshed;
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(refreshes).toBe(1);
    } finally {
      stop();
    }
  });
});
