import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it, vi} from 'vitest';
import {watchRefreshSignal} from '../src/refresh.js';

describe('watchRefreshSignal', () => {
  it('resets the debounce delay after repeated Shopify CLI notifications', async () => {
    vi.useFakeTimers();
    const root = mkdtempSync(join(tmpdir(), 'frame-refresh-'));
    const signal = join(root, '.frame/shopify-ready');
    const refresh = vi.fn();
    const stop = watchRefreshSignal(signal, 100, refresh);

    try {
      writeFileSync(signal, 'first');
      await vi.advanceTimersByTimeAsync(50);
      writeFileSync(signal, 'second notification');
      await vi.advanceTimersByTimeAsync(50);
      await vi.advanceTimersByTimeAsync(99);
      expect(refresh).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(refresh).toHaveBeenCalledOnce();
    } finally {
      stop();
      vi.useRealTimers();
    }
  });
});
