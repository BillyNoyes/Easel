import {describe, expect, it} from 'vitest';
import easel, {
  easel as namedEasel,
  type EaselBundle,
  type EaselOptions,
  type EaselRefreshOptions,
} from '../src/index.js';

describe('public API', () => {
  it('exports Easel as both the default and named plugin factory', () => {
    expect(namedEasel).toBe(easel);
    const bundle: EaselBundle = {script: 'main.ts', style: 'style.css'};
    const refresh: EaselRefreshOptions = {signal: '.easel/custom-ready', delay: 50};
    const options: EaselOptions = {bundles: {theme: bundle}, refresh};

    expect(easel(options).map((plugin) => plugin.name)).toEqual([
      'easel:bundle-modules',
      'easel:shopify-theme',
    ]);
  });
});
